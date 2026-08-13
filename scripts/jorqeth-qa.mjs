#!/usr/bin/env node

import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const ARTIFACT_DIR = join(REPO_ROOT, "artifacts", "qa");
const DEFAULT_BASE_URL = process.env.JORQETH_BASE_URL || "https://jorqeth.vercel.app";
const DEFAULT_TIMEOUT_MS = 15_000;
const SCHEMA_VERSION = 1;

const ROUTES = [
  { path: "/", label: "landing", marker: "Jorqeth" },
  { path: "/how", label: "how route", marker: "How Jorqeth works" },
  { path: "/proof", label: "proof route", marker: "Completed Flare FCE settlement proof" },
  { path: "/security", label: "security route", marker: "Security" },
  { path: "/faq", label: "faq route", marker: "Straight answers" },
  { path: "/app", label: "primary app", marker: "Connect the wallet that will fund the payment" },
  { path: "/app/demo", label: "fallback app", marker: "Connect wallet" },
  { path: "/app/activity", label: "activity route", marker: "Safety checks" },
  { path: "/app/receipt", label: "receipt route", marker: "Latest payment" },
  { path: "/app/inspector", label: "inspector route", marker: "Why this amount" },
  { path: "/docs", label: "docs route", marker: "How Jorqeth settles a private commission" },
  { path: "/terms", label: "terms route", marker: "Terms of use" },
  { path: "/privacy", label: "privacy route", marker: "Privacy" },
];

const STATIC_ASSETS = [
  { path: "/assets/favicon.svg", type: "image/svg+xml" },
  { path: "/assets/favicon-32.png", type: "image/png" },
  { path: "/assets/apple-touch-icon.png", type: "image/png" },
  { path: "/assets/mark.svg", type: "image/svg+xml" },
  { path: "/assets/og.png", type: "image/png" },
  { path: "/assets/hero.jpg", type: "image/jpeg" },
  { path: "/assets/problem.jpg", type: "image/jpeg" },
  { path: "/assets/security.jpg", type: "image/jpeg" },
];

const REQUIRED_FILES = [
  ".env.example",
  ".gitignore",
  "README.md",
  "vercel.json",
  "site/package.json",
  "site/package-lock.json",
  "site/next.config.ts",
  "site/app/api/fce-result/route.ts",
  "site/components/FxrpPaymentFlow.tsx",
  "site/lib/live-proof.ts",
  "deployments/coston2-live-demo.json",
  "web/test/view.test.mjs",
  "web/test/surfaces.test.mjs",
];

const REQUIRED_PUBLIC_ENV = [
  "NEXT_PUBLIC_COSTON2_RPC_URL",
  "NEXT_PUBLIC_JORQETH_FXRP_TOKEN_ADDRESS",
  "NEXT_PUBLIC_JORQETH_FXRP_FACTORY_ADDRESS",
  "NEXT_PUBLIC_JORQETH_FCE_VERIFIER_ADDRESS",
  "NEXT_PUBLIC_JORQETH_FCE_INSTRUCTION_SENDER_ADDRESS",
  "NEXT_PUBLIC_JORQETH_FCE_EXTENSION_ID",
];

const REQUIRED_SERVER_ENV = ["JORQETH_FCE_PROXY_URL"];

const EXPECTED_FXRP_TOKEN = "0x0b6A3645c240605887a5532109323A3E12273dc7";
const EXPECTED_INSTRUCTION_SENDER = "0x86bE7C32A5E566b105a224F94b3A2Ed3F751d097";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    ci: false,
    full: false,
    json: false,
    help: false,
    quiet: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    verbose: false,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--quiet") options.quiet = true;
    else if (arg === "--verbose") options.verbose = true;
    else if (arg === "--ci") options.ci = true;
    else if (arg === "--full") options.full = true;
    else if (arg === "--url" || arg === "--base-url") {
      options.baseUrl = argv[++index] || options.baseUrl;
    } else if (arg === "--timeout") {
      options.timeoutMs = parseDuration(argv[++index] || "", DEFAULT_TIMEOUT_MS);
    } else if (arg.startsWith("--url=")) {
      options.baseUrl = arg.slice("--url=".length);
    } else if (arg.startsWith("--timeout=")) {
      options.timeoutMs = parseDuration(arg.slice("--timeout=".length), DEFAULT_TIMEOUT_MS);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  let command = options.help ? "help" : positional.shift() || "help";
  let subcommand = positional.shift();
  options.flow = positional.shift() || "primary";
  if (command === "config" && !subcommand) subcommand = "check";
  if (command === "qa" && subcommand === "full") options.full = true;

  return { command, subcommand, options, positional };
}

function parseDuration(value, fallback) {
  const match = /^([0-9]+(?:\.[0-9]+)?)(ms|s|m)?$/i.exec(value.trim());
  if (!match) return fallback;
  const amount = Number(match[1]);
  const unit = (match[2] || "ms").toLowerCase();
  const multiplier = unit === "m" ? 60_000 : unit === "s" ? 1_000 : 1;
  return Math.max(100, Math.round(amount * multiplier));
}

function readText(relativePath) {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function fileExists(relativePath) {
  return existsSync(join(REPO_ROOT, relativePath));
}

function redact(value) {
  return String(value)
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|auth[_-]?token|private[_-]?key|password|secret)\s*[:=]\s*)[^\s,]+/gi, "$1[REDACTED]")
    .replace(/(-----BEGIN [^-]+-----)[\s\S]*?(-----END [^-]+-----)/g, "$1[REDACTED]$2");
}

function tail(value, length = 2_000) {
  const safe = redact(value || "");
  return safe.length > length ? safe.slice(-length) : safe;
}

function commandAvailable(command) {
  try {
    const result = spawnSync(command, ["--version"], { cwd: REPO_ROOT, encoding: "utf8" });
    return result.status === 0 || Boolean(result.stdout || result.stderr);
  } catch {
    return false;
  }
}

function spawnSync(command, args, options) {
  const { execFileSync } = createRequire(import.meta.url)("node:child_process");
  try {
    const output = execFileSync(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout: output?.toString() || "", stderr: "" };
  } catch (error) {
    return {
      status: typeof error?.status === "number" ? error.status : 1,
      stdout: error?.stdout?.toString?.() || "",
      stderr: error?.stderr?.toString?.() || "",
    };
  }
}

function runCommand(command, timeoutMs) {
  return new Promise((resolvePromise) => {
    const started = Date.now();
    const child = spawn(command, {
      cwd: REPO_ROOT,
      env: { ...process.env, CI: process.env.CI || "1" },
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1_000).unref();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({
        command,
        code: typeof code === "number" ? code : 1,
        signal: signal || null,
        durationMs: Date.now() - started,
        stderr,
        stdout,
        timedOut,
      });
    };
    child.on("error", (error) => {
      stderr += `\n${error.message}`;
      finish(1, null);
    });
    child.on("close", finish);
  });
}

function ensureArtifactDir() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function artifactLog(checkId, output) {
  ensureArtifactDir();
  const fileName = `${checkId.replace(/[^a-z0-9_-]+/gi, "-")}.log`;
  writeFileSync(join(ARTIFACT_DIR, fileName), redact(output || ""));
  return `artifacts/qa/${fileName}`;
}

function normalizeCheckResult(result) {
  return {
    status: result.status || "PASS",
    evidence: result.evidence || {},
    reason: result.reason || null,
    suggestedFix: result.suggestedFix || null,
  };
}

async function collectCheck(report, id, name, fn) {
  const started = Date.now();
  try {
    const result = normalizeCheckResult(await fn());
    report.checks.push({
      id,
      name,
      status: result.status,
      durationMs: Date.now() - started,
      evidence: result.evidence,
      reason: result.reason,
      suggestedFix: result.suggestedFix,
    });
  } catch (error) {
    report.checks.push({
      id,
      name,
      status: "FAIL",
      durationMs: Date.now() - started,
      evidence: { error: redact(error instanceof Error ? error.message : String(error)) },
      reason: "The check threw before it could return a structured result.",
      suggestedFix: "Inspect the check output and rerun it after fixing the underlying error.",
    });
  }
}

async function fetchUrl(url, timeoutMs, options = {}) {
  const started = Date.now();
  const response = await fetch(url, {
    redirect: options.redirect || "manual",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: options.accept || "text/html,application/json" },
  });
  const body = await response.text();
  return {
    body,
    contentType: response.headers.get("content-type") || "",
    headers: Object.fromEntries(response.headers.entries()),
    location: response.headers.get("location"),
    ms: Date.now() - started,
    status: response.status,
    url,
  };
}

function checkHttpResponse(result, expectedStatus, marker) {
  if (result.status !== expectedStatus) {
    return {
      status: "FAIL",
      evidence: { status: result.status, expectedStatus, bytes: result.body.length, ms: result.ms },
      reason: `Expected HTTP ${expectedStatus} but received HTTP ${result.status}.`,
      suggestedFix: "Inspect the deployment route and its Vercel build output.",
    };
  }
  if (marker && !result.body.includes(marker)) {
    return {
      status: "FAIL",
      evidence: { status: result.status, bytes: result.body.length, ms: result.ms },
      reason: `The response did not contain the expected marker: ${marker}.`,
      suggestedFix: "Check that the deployed route is serving the current application build.",
    };
  }
  return {
    status: "PASS",
    evidence: { status: result.status, contentType: result.contentType, bytes: result.body.length, ms: result.ms },
  };
}

function parseEnvTemplate(content) {
  const values = new Map();
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

function extractEnvReferences() {
  const references = new Set();
  const search = spawnSync("rg", ["-o", "process\\.env\\.[A-Z][A-Z0-9_]*", "site/lib", "site/app", "site/components", "site/next.config.ts"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  for (const match of search.stdout.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    references.add(match[1]);
  }
  for (const match of readText("foundry.toml").matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)) {
    references.add(match[1]);
  }
  return [...references].filter((name) => name !== "NODE_ENV").sort();
}

function requiredPackageBinaries() {
  return {
    next: fileExists("site/node_modules/.bin/next"),
    tsc: fileExists("site/node_modules/.bin/tsc"),
  };
}

function formatStatus(status) {
  return status.padEnd(4, " ");
}

function summaryFor(report) {
  const summary = { pass: 0, fail: 0, warn: 0, skip: 0, total: report.checks.length };
  for (const check of report.checks) {
    const key = check.status.toLowerCase();
    if (key in summary) summary[key] += 1;
  }
  return summary;
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function writeArtifacts(report) {
  ensureArtifactDir();
  writeFileSync(join(ARTIFACT_DIR, "summary.json"), `${JSON.stringify(report, null, 2)}\n`);
  const lines = [
    `# Jorqeth QA report`,
    ``,
    `- Schema: ${report.schemaVersion}`,
    `- Command: \`${report.command}\``,
    `- Base URL: ${report.baseUrl}`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Result: ${report.result}`,
    `- Summary: ${report.summary.pass} PASS, ${report.summary.fail} FAIL, ${report.summary.warn} WARN, ${report.summary.skip} SKIP`,
    ``,
    `| Status | Check | Duration | Reason |`,
    `| --- | --- | ---: | --- |`,
  ];
  for (const check of report.checks) {
    lines.push(`| ${check.status} | ${check.name} | ${check.durationMs} ms | ${check.reason || ""} |`);
  }
  lines.push("", "## Evidence", "");
  for (const check of report.checks) {
    lines.push(`### ${check.id}`, "", "```json", JSON.stringify(check.evidence, null, 2), "```", "");
    if (check.suggestedFix) lines.push(`Suggested fix: ${check.suggestedFix}`, "");
  }
  writeFileSync(join(ARTIFACT_DIR, "summary.md"), `${lines.join("\n")}\n`);

  const failures = report.checks.filter((check) => check.status === "FAIL");
  const skipped = report.checks.filter((check) => check.status === "SKIP");
  const junit = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="jorqeth-qa" tests="${report.checks.length}" failures="${failures.length}" skipped="${skipped.length}">`,
  ];
  for (const check of report.checks) {
    junit.push(`  <testcase classname="jorqeth.qa" name="${xmlEscape(check.id)}" time="${(check.durationMs / 1000).toFixed(3)}">`);
    if (check.status === "FAIL") {
      junit.push(`    <failure message="${xmlEscape(check.reason || "check failed")}">${xmlEscape(JSON.stringify(check.evidence))}</failure>`);
    } else if (check.status === "SKIP") {
      junit.push(`    <skipped message="${xmlEscape(check.reason || "check skipped")}" />`);
    }
    junit.push("  </testcase>");
  }
  junit.push("</testsuite>", "");
  writeFileSync(join(ARTIFACT_DIR, "junit.xml"), junit.join("\n"));
}

function buildReport(command, options) {
  return {
    schemaVersion: SCHEMA_VERSION,
    app: "jorqeth",
    command,
    baseUrl: options.baseUrl.replace(/\/$/, ""),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: "PASS",
    exitCode: 0,
    summary: { pass: 0, fail: 0, warn: 0, skip: 0, total: 0 },
    checks: [],
  };
}

async function checkRequiredFiles(report) {
  await collectCheck(report, "repo.required-files", "Required repository files", async () => {
    const missing = REQUIRED_FILES.filter((file) => !fileExists(file));
    return missing.length
      ? {
          status: "FAIL",
          evidence: { missing },
          reason: "The repository is missing files required by its documented build or runtime.",
          suggestedFix: "Restore the missing files or update the command and deployment documentation.",
        }
      : { status: "PASS", evidence: { count: REQUIRED_FILES.length } };
  });
}

async function checkConfig(report) {
  await collectCheck(report, "config.env-template", "Environment template coverage", async () => {
    const values = parseEnvTemplate(readText(".env.example"));
    const missing = [...REQUIRED_PUBLIC_ENV, ...REQUIRED_SERVER_ENV].filter((name) => !values.has(name));
    const references = extractEnvReferences();
    const undeclared = references.filter((name) => !values.has(name) && !name.startsWith("CI"));
    if (missing.length || undeclared.length) {
      return {
        status: "FAIL",
        evidence: { missing, undeclared, declaredCount: values.size },
        reason: "The environment template does not cover every required runtime variable.",
        suggestedFix: "Add the missing variable names to .env.example without adding secret values.",
      };
    }
    return {
      status: "PASS",
      evidence: {
        declaredCount: values.size,
        requiredPublic: REQUIRED_PUBLIC_ENV.length,
        requiredServer: REQUIRED_SERVER_ENV.length,
        secretValuesPrinted: false,
      },
    };
  });

  await collectCheck(report, "config.local-runtime", "Local runtime configuration", async () => {
    const localFiles = [".env", ".env.local", "site/.env", "site/.env.local"];
    const present = localFiles.filter((file) => fileExists(file));
    return present.length
      ? {
          status: "PASS",
          evidence: { present, valuesPrinted: false },
        }
      : {
          status: "WARN",
          evidence: { present: [], valuesPrinted: false },
          reason: "No local runtime environment file is present in this checkout.",
          suggestedFix: "Create site/.env.local from .env.example when running the wallet flow locally. Keep secrets out of Git.",
        };
  });

  await collectCheck(report, "config.secret-scan", "Tracked secret pattern scan", async () => {
    const result = spawnSync("git", ["grep", "-nE", "(-----BEGIN [^-]+-----|sk-[A-Za-z0-9]{20,})", "--", "."], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return result.status === 1
      ? { status: "PASS", evidence: { matches: 0, valuesPrinted: false } }
      : {
          status: "FAIL",
          evidence: { matches: result.stdout.split(/\r?\n/).filter(Boolean).length, valuesPrinted: false },
          reason: "A tracked file matched a private-key or API-key pattern.",
          suggestedFix: "Remove the secret from Git history and rotate it before release.",
        };
  });
}

async function checkSourceDrift(report) {
  await collectCheck(report, "source.route-drift", "Documented routes match the App Router", async () => {
    const readme = readText("site/README.md");
    const routePaths = new Set(
      ROUTES.map(({ path }) => path).concat("/api/fce-result"),
    );
    const documentedRoutes = [...readme.matchAll(/\|\s*`([^`]+)`\s*\|/g)].map((match) => match[1]);
    const stale = documentedRoutes.filter((route) => route.startsWith("/") && !routePaths.has(route));
    const missing = ["/app", "/app/demo", "/api/fce-result"].filter((route) => !documentedRoutes.includes(route));
    return stale.length || missing.length
      ? {
          status: "FAIL",
          evidence: { stale, missing, documentedRoutes },
          reason: "The site README lists a route that is absent or omits a route used by the app.",
          suggestedFix: "Update site/README.md to match the generated Next.js route table.",
        }
      : { status: "PASS", evidence: { documentedRoutes } };
  });

  await collectCheck(report, "source.primary-copy", "Primary FXRP copy is consistent", async () => {
    const docs = readText("site/app/docs/page.tsx");
    const stale = [...docs.matchAll(/test mUSD/gi)].map((match) => match[0]);
    return stale.length
      ? {
          status: "FAIL",
          evidence: { staleMentions: stale.length, expectedAsset: "test FXRP" },
          reason: "The primary documentation still tells users to fund mUSD while the primary app uses FXRP.",
          suggestedFix: "Change the primary journey copy to test FXRP and reserve mUSD for the legacy fallback documentation.",
        }
      : { status: "PASS", evidence: { expectedAsset: "test FXRP", staleMentions: 0 } };
  });

  await collectCheck(report, "source.fallback-description", "Fallback route description matches its implementation", async () => {
    const page = readText("site/app/app/demo/page.tsx");
    const component = readText("site/components/SettlementJourney.tsx");
    const claimsFce = component.includes("fceInstructionSenderAbi") && component.includes("/api/fce-result");
    const claimsDisclosedSigner = /disclosed-signer/i.test(page);
    return claimsFce && claimsDisclosedSigner
      ? {
          status: "FAIL",
          evidence: { implementation: "legacy mUSD FCE flow", documentedAs: "disclosed-signer" },
          reason: "The /app/demo metadata calls the flow disclosed-signer, but the component sends an FCE instruction and polls the FCE result bridge.",
          suggestedFix: "Rename the fallback description to the legacy mUSD FCE flow, or restore a real disclosed-signer implementation before claiming one.",
        }
      : { status: "PASS", evidence: { claimsFce, claimsDisclosedSigner } };
  });
}

async function checkDoctor(report) {
  await checkRequiredFiles(report);

  await collectCheck(report, "doctor.runtime", "Node and npm runtime", async () => {
    const nodeMajor = Number(process.versions.node.split(".")[0]);
    const npm = commandAvailable("npm");
    return nodeMajor >= 18 && npm
      ? { status: "PASS", evidence: { node: process.versions.node, npm: true } }
      : {
          status: "FAIL",
          evidence: { node: process.versions.node, npm },
          reason: "The supported Node runtime or npm is unavailable.",
          suggestedFix: "Use Node 18 or newer and install npm before running the site checks.",
        };
  });

  await collectCheck(report, "doctor.dependencies", "Site dependencies", async () => {
    const binaries = requiredPackageBinaries();
    return binaries.next && binaries.tsc
      ? { status: "PASS", evidence: binaries }
      : {
          status: "WARN",
          evidence: binaries,
          reason: "The site dependency binaries are not installed in this checkout.",
          suggestedFix: "Run npm ci in site/ before typecheck, build, or local browser QA.",
        };
  });

  await collectCheck(report, "doctor.toolchains", "Optional contract and Go toolchains", async () => {
    const available = { forge: commandAvailable("forge"), go: commandAvailable("go") };
    const missing = Object.entries(available).filter(([, value]) => !value).map(([name]) => name);
    return missing.length
      ? {
          status: "SKIP",
          evidence: available,
          reason: `Optional toolchain unavailable: ${missing.join(", ")}.`,
          suggestedFix: "Install the missing toolchain to run full contract and extension QA.",
        }
      : { status: "PASS", evidence: available };
  });

  await collectCheck(report, "doctor.browser-harness", "Browser smoke harness", async () => {
    const globalRootResult = spawnSync("npm", ["root", "-g"], { cwd: REPO_ROOT, encoding: "utf8" });
    const globalRoot = globalRootResult.stdout.trim();
    const playwrightPath = globalRoot ? join(globalRoot, "playwright") : "";
    const chromiumConfigured = Boolean(process.env.PLAYWRIGHT_CHROMIUM || process.env.CHROME_PATH);
    const available = Boolean(playwrightPath && existsSync(playwrightPath));
    return available
      ? { status: "PASS", evidence: { playwright: true, chromiumConfigured } }
      : {
          status: "SKIP",
          evidence: { playwright: false, chromiumConfigured },
          reason: "The existing browser smoke scripts require a global Playwright install that is not available here.",
          suggestedFix: "Install Playwright and a Chromium binary, then rerun the browser smoke command.",
        };
  });
}

async function runCommandCheck(report, id, name, command, timeoutMs, missingStatus = "SKIP") {
  await collectCheck(report, id, name, async () => {
    const result = await runCommand(command, timeoutMs);
    const log = artifactLog(id, `${result.stdout}\n${result.stderr}`);
    if (result.code === 127 || /command not found/i.test(result.stderr)) {
      return {
        status: missingStatus,
        evidence: { command, exitCode: result.code, durationMs: result.durationMs, log },
        reason: "The command is unavailable in this environment.",
        suggestedFix: "Install the required toolchain and rerun the check.",
      };
    }
    if (result.timedOut) {
      return {
        status: "FAIL",
        evidence: { command, exitCode: result.code, durationMs: result.durationMs, timedOut: true, log, output: tail(`${result.stdout}\n${result.stderr}`) },
        reason: `The command exceeded the ${timeoutMs} ms timeout.`,
        suggestedFix: "Inspect the command log, fix the slow or blocked step, and rerun with a longer timeout only when justified.",
      };
    }
    return result.code === 0
      ? { status: "PASS", evidence: { command, exitCode: 0, durationMs: result.durationMs, log, output: tail(result.stdout) } }
      : {
          status: "FAIL",
          evidence: { command, exitCode: result.code, durationMs: result.durationMs, log, output: tail(`${result.stdout}\n${result.stderr}`) },
          reason: `The command exited with code ${result.code}.`,
          suggestedFix: "Read the command log and fix the failing repository check.",
        };
  });
}

async function checkTests(report, options, full = false) {
  await runCommandCheck(
    report,
    "test.web-unit",
    "Legacy web state tests",
    "node --test web/test/view.test.mjs web/test/surfaces.test.mjs",
    options.timeoutMs,
  );

  const binaries = requiredPackageBinaries();
  if (binaries.tsc) await runCommandCheck(report, "test.site-typecheck", "Next.js typecheck", "npm --prefix site run typecheck", options.timeoutMs);
  else report.checks.push({ id: "test.site-typecheck", name: "Next.js typecheck", status: "SKIP", durationMs: 0, evidence: { dependency: "site/node_modules/.bin/tsc" }, reason: "Site dependencies are not installed.", suggestedFix: "Run npm ci in site/ and rerun the check." });
  if (binaries.next) await runCommandCheck(report, "test.site-build", "Next.js production build", "npm --prefix site run build", options.timeoutMs);
  else report.checks.push({ id: "test.site-build", name: "Next.js production build", status: "SKIP", durationMs: 0, evidence: { dependency: "site/node_modules/.bin/next" }, reason: "Site dependencies are not installed.", suggestedFix: "Run npm ci in site/ and rerun the check." });

  if (!full) return;

  if (commandAvailable("forge")) {
    await runCommandCheck(report, "test.forge-format", "Foundry formatting", "forge fmt --check", options.timeoutMs);
    await runCommandCheck(report, "test.forge-build", "Foundry build", "forge build", options.timeoutMs);
    await runCommandCheck(report, "test.forge-tests", "Foundry tests", "forge test -vvv", options.timeoutMs);
  } else {
    for (const [id, name] of [["test.forge-format", "Foundry formatting"], ["test.forge-build", "Foundry build"], ["test.forge-tests", "Foundry tests"]]) {
      report.checks.push({ id, name, status: "SKIP", durationMs: 0, evidence: { tool: "forge" }, reason: "Foundry is not installed in this environment.", suggestedFix: "Install Foundry or rely on the latest GitHub Actions result for contract verification." });
    }
  }

  if (commandAvailable("go")) {
    await runCommandCheck(report, "test.go-fce", "FCE extension tests and vet", "cd fce-extension && go test ./... && go vet ./...", options.timeoutMs);
    await runCommandCheck(report, "test.go-signer", "TEE signer tests and vet", "cd tools/tee-signer && go test ./... && go vet ./...", options.timeoutMs);
  } else {
    for (const [id, name] of [["test.go-fce", "FCE extension tests and vet"], ["test.go-signer", "TEE signer tests and vet"]]) {
      report.checks.push({ id, name, status: "SKIP", durationMs: 0, evidence: { tool: "go" }, reason: "Go is not installed in this environment.", suggestedFix: "Install Go or rely on the latest GitHub Actions result for extension verification." });
    }
  }

  const globalRootResult = spawnSync("npm", ["root", "-g"], { cwd: REPO_ROOT, encoding: "utf8" });
  const playwrightAvailable = Boolean(globalRootResult.stdout.trim() && existsSync(join(globalRootResult.stdout.trim(), "playwright")));
  if (playwrightAvailable) {
    await runCommandCheck(report, "test.browser-replay", "Browser replay smoke", "node web/smoke.mjs && node web/smoke-surfaces.mjs", options.timeoutMs);
  } else {
    report.checks.push({ id: "test.browser-replay", name: "Browser replay smoke", status: "SKIP", durationMs: 0, evidence: { tool: "global Playwright" }, reason: "The existing browser smoke scripts cannot resolve global Playwright.", suggestedFix: "Install Playwright and Chromium before running full browser QA." });
  }
}

async function checkLiveRoutes(report, options) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  for (const route of ROUTES) {
    await collectCheck(report, `deploy.route-${route.path === "/" ? "root" : route.path.slice(1).replaceAll("/", "-")}`, `Deployment route ${route.path}`, async () => {
      try {
        const response = await fetchUrl(`${baseUrl}${route.path}`, options.timeoutMs);
        return checkHttpResponse(response, 200, route.marker);
      } catch (error) {
        return {
          status: "FAIL",
          evidence: { url: `${baseUrl}${route.path}`, error: redact(error instanceof Error ? error.message : String(error)) },
          reason: "The deployment route could not be fetched.",
          suggestedFix: "Check the deployment URL, Vercel status, and route build output.",
        };
      }
    });
  }

  for (const asset of STATIC_ASSETS) {
    await collectCheck(report, `deploy.asset-${asset.path.split("/").pop()}`, `Deployment asset ${asset.path}`, async () => {
      try {
        const response = await fetchUrl(`${baseUrl}${asset.path}`, options.timeoutMs, { accept: "*/*" });
        const result = checkHttpResponse(response, 200);
        if (result.status === "FAIL") return result;
        const contentTypeMatches = response.contentType.startsWith(asset.type);
        return contentTypeMatches
          ? { status: "PASS", evidence: { status: response.status, contentType: response.contentType, bytes: response.body.length, ms: response.ms } }
          : {
              status: "FAIL",
              evidence: { status: response.status, contentType: response.contentType, expected: asset.type, bytes: response.body.length },
              reason: "The asset returned an unexpected content type.",
              suggestedFix: "Check the public asset path and Vercel output directory.",
            };
      } catch (error) {
        return {
          status: "FAIL",
          evidence: { url: `${baseUrl}${asset.path}`, error: redact(error instanceof Error ? error.message : String(error)) },
          reason: "The deployment asset could not be fetched.",
          suggestedFix: "Check the asset path and deployment output.",
        };
      }
    });
  }

  await collectCheck(report, "deploy.security-headers", "Deployment security headers", async () => {
    try {
      const response = await fetchUrl(`${baseUrl}/`, options.timeoutMs);
      const required = ["content-security-policy", "strict-transport-security", "x-content-type-options", "x-frame-options"];
      const present = required.filter((header) => Boolean(response.headers[header]));
      const missing = required.filter((header) => !present.includes(header));
      return missing.length
        ? {
            status: "WARN",
            evidence: { present, missing },
            reason: "The deployment is missing one or more expected browser security headers.",
            suggestedFix: "Configure the missing headers in Next.js or Vercel before production use.",
          }
        : { status: "PASS", evidence: { present } };
    } catch (error) {
      return { status: "FAIL", evidence: { error: redact(error instanceof Error ? error.message : String(error)) }, reason: "The deployment headers could not be read.", suggestedFix: "Check the deployment URL." };
    }
  });

  await collectCheck(report, "deploy.copy-drift", "Deployed copy matches the current product model", async () => {
    try {
      const [docs, fallback] = await Promise.all([
        fetchUrl(`${baseUrl}/docs`, options.timeoutMs),
        fetchUrl(`${baseUrl}/app/demo`, options.timeoutMs),
      ]);
      const stale = [];
      if (/test mUSD/i.test(docs.body)) stale.push("/docs still mentions test mUSD");
      if (/disclosed-signer/i.test(fallback.body)) stale.push("/app/demo still claims disclosed-signer");
      return stale.length
        ? {
            status: "FAIL",
            evidence: { stale, docsStatus: docs.status, fallbackStatus: fallback.status },
            reason: "The deployed pages still contain copy that the repository QA fixed locally.",
            suggestedFix: "Deploy the current main branch and rerun the production QA CLI against the deployment URL.",
          }
        : { status: "PASS", evidence: { docsStatus: docs.status, fallbackStatus: fallback.status, stale: [] } };
    } catch (error) {
      return { status: "FAIL", evidence: { error: redact(error instanceof Error ? error.message : String(error)) }, reason: "The deployed copy could not be read for drift checks.", suggestedFix: "Check the deployment URL and route availability." };
    }
  });
}

async function checkApi(report, options) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  await collectCheck(report, "api.fce-health", "FCE result bridge health", async () => {
    try {
      const response = await fetchUrl(`${baseUrl}/api/fce-result?health=1`, options.timeoutMs, { accept: "application/json" });
      let payload;
      try { payload = JSON.parse(response.body); } catch { payload = null; }
      const ready = response.status === 200 && payload?.configured === true && payload?.ready === true;
      return ready
        ? { status: "PASS", evidence: { status: response.status, configured: true, ready: true, contentType: response.contentType, ms: response.ms } }
        : {
            status: "FAIL",
            evidence: { status: response.status, configured: payload?.configured ?? null, ready: payload?.ready ?? null, contentType: response.contentType, ms: response.ms },
            reason: "The primary FCE result bridge is not reporting configured and ready.",
            suggestedFix: "Set the server-only JORQETH_FCE_PROXY_URL and verify the proxy /info endpoint.",
          };
    } catch (error) {
      return { status: "FAIL", evidence: { error: redact(error instanceof Error ? error.message : String(error)) }, reason: "The FCE health endpoint could not be reached.", suggestedFix: "Check the deployment and FCE proxy availability." };
    }
  });

  await collectCheck(report, "api.invalid-instruction", "FCE input validation", async () => {
    try {
      const response = await fetchUrl(`${baseUrl}/api/fce-result?instructionId=bad`, options.timeoutMs, { accept: "application/json" });
      let payload;
      try { payload = JSON.parse(response.body); } catch { payload = null; }
      return response.status === 400 && payload?.code === "INVALID_VERIFICATION_REQUEST"
        ? { status: "PASS", evidence: { status: response.status, code: payload.code } }
        : {
            status: "FAIL",
            evidence: { status: response.status, code: payload?.code || null },
            reason: "The FCE API did not reject an invalid instruction ID with its documented 400 contract.",
            suggestedFix: "Preserve strict instruction ID validation at the API boundary.",
          };
    } catch (error) {
      return { status: "FAIL", evidence: { error: redact(error instanceof Error ? error.message : String(error)) }, reason: "The FCE API validation endpoint could not be reached.", suggestedFix: "Check the deployment URL." };
    }
  });
}

async function rpcCall(url, method, params, timeoutMs) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error?.message || `RPC HTTP ${response.status}`);
  return payload.result;
}

function addressTopic(address) {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

async function checkProof(report, options) {
  await collectCheck(report, "proof.static-consistency", "Committed live proof consistency", async () => {
    const evidence = readJson("deployments/coston2-live-demo.json");
    const source = readText("site/lib/live-proof.ts");
    const requiredValues = [
      evidence.campaign.address,
      evidence.instruction.transaction,
      evidence.instruction.id,
      evidence.settlement.transaction,
      String(evidence.settlement.paidAmount),
      String(evidence.settlement.remainingEscrow),
      String(Number(evidence.settlement.creatorBalanceChange) / 1_000_000),
    ];
    const missing = requiredValues.filter((value) => !source.includes(String(value)));
    return missing.length
      ? {
          status: "FAIL",
          evidence: { missingCount: missing.length, expectedAsset: evidence.asset.symbol },
          reason: "The hosted proof page is out of sync with the committed deployment evidence.",
          suggestedFix: "Regenerate site/lib/live-proof.ts from deployments/coston2-live-demo.json and rebuild.",
        }
      : {
          status: "PASS",
          evidence: { asset: evidence.asset.symbol, campaign: evidence.campaign.address, replayRejected: evidence.settlement.replayRejected },
        };
  });

  const rpcUrl = process.env.COSTON2_RPC_URL || "https://coston2-api.flare.network/ext/C/rpc";
  await collectCheck(report, "proof.coston2-receipts", "Coston2 proof transaction receipts", async () => {
    const evidence = readJson("deployments/coston2-live-demo.json");
    try {
      const [chainId, instructionTx, instructionReceipt, settlementTx, settlementReceipt] = await Promise.all([
        rpcCall(rpcUrl, "eth_chainId", [], options.timeoutMs),
        rpcCall(rpcUrl, "eth_getTransactionByHash", [evidence.instruction.transaction], options.timeoutMs),
        rpcCall(rpcUrl, "eth_getTransactionReceipt", [evidence.instruction.transaction], options.timeoutMs),
        rpcCall(rpcUrl, "eth_getTransactionByHash", [evidence.settlement.transaction], options.timeoutMs),
        rpcCall(rpcUrl, "eth_getTransactionReceipt", [evidence.settlement.transaction], options.timeoutMs),
      ]);
      const transfer = (settlementReceipt.logs || []).find((log) =>
        log.address.toLowerCase() === evidence.asset.address.toLowerCase() &&
        log.topics[0].toLowerCase() === TRANSFER_TOPIC &&
        log.topics[1].toLowerCase() === addressTopic(evidence.campaign.address) &&
        log.topics[2].toLowerCase() === addressTopic(evidence.campaign.creator),
      );
      const amount = transfer ? BigInt(transfer.data).toString() : null;
      const valid = chainId === "0x72" &&
        instructionTx?.to?.toLowerCase() === EXPECTED_INSTRUCTION_SENDER.toLowerCase() &&
        instructionReceipt?.status === "0x1" &&
        settlementTx?.to?.toLowerCase() === evidence.campaign.address.toLowerCase() &&
        settlementReceipt?.status === "0x1" &&
        amount === evidence.settlement.paidAmountBaseUnits;
      return valid
        ? {
            status: "PASS",
            evidence: { chainId, instructionStatus: instructionReceipt.status, settlementStatus: settlementReceipt.status, token: evidence.asset.address, paidAmountBaseUnits: amount },
          }
        : {
            status: "FAIL",
            evidence: { chainId, instructionTo: instructionTx?.to || null, instructionStatus: instructionReceipt?.status || null, settlementTo: settlementTx?.to || null, settlementStatus: settlementReceipt?.status || null, transferFound: Boolean(transfer), paidAmountBaseUnits: amount },
            reason: "The live proof transaction receipts do not match the committed FTestXRP settlement evidence.",
            suggestedFix: "Re-read the Coston2 receipts, correct the proof bundle, and do not label a reverted or different-token transaction as complete.",
          };
    } catch (error) {
      return {
        status: "FAIL",
        evidence: { rpc: rpcUrl.replace(/\/[^/]*$/, "/..."), error: redact(error instanceof Error ? error.message : String(error)) },
        reason: "Coston2 proof receipts could not be read from the configured RPC endpoint.",
        suggestedFix: "Check COSTON2_RPC_URL and the Coston2 RPC service before relying on the proof page.",
      };
    }
  });
}

async function checkPrimaryFlow(report, options) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  await collectCheck(report, "flow.primary-signed-out", "Primary app signed-out state", async () => {
    try {
      const response = await fetchUrl(`${baseUrl}/app`, options.timeoutMs);
      const required = ["Connect the wallet that will fund the payment", "Connect wallet", "Payment terms", "Recipient", "Commission"];
      const missing = required.filter((marker) => !response.body.includes(marker));
      return response.status === 200 && missing.length === 0
        ? { status: "PASS", evidence: { status: response.status, signedOut: true, requiredMarkers: required } }
        : {
            status: "FAIL",
            evidence: { status: response.status, signedOut: missing.length === 0, missing },
            reason: "The primary app does not expose the expected signed-out setup flow.",
            suggestedFix: "Check the primary payment component and deployment build.",
          };
    } catch (error) {
      return { status: "FAIL", evidence: { error: redact(error instanceof Error ? error.message : String(error)) }, reason: "The primary app could not be fetched.", suggestedFix: "Check the deployment URL." };
    }
  });
}

function printHelp() {
  console.log(`Jorqeth production QA CLI

Usage:
  npm run cli -- <command> [options]

Commands:
  health              Check the deployed pages, assets, headers, and FCE API.
  doctor              Inspect repository files, config, dependencies, and toolchains.
  config check        Validate env template coverage without printing values.
  test                Run available unit and site checks.
  deploy check        Verify live routes and committed Coston2 proof receipts.
  flow list           List supported read-only product flows.
  flow run primary    Verify the signed-out primary FXRP payment flow.
  qa                  Run standard source, test, deployment, and flow QA.
  qa --full           Add Foundry, Go, and browser smoke checks when available.
  report              Print the latest artifacts/qa/summary.json.

Options:
  --url <url>         Deployment base URL. Default: ${DEFAULT_BASE_URL}
  --timeout <time>   Per-check timeout, for example 10s or 1m.
  --json              Print the stable JSON report.
  --ci                Keep machine-readable exit behavior for CI.
  --full              Include optional full toolchain checks.
  --verbose           Include command output in the report.
  --quiet             Print only the final result.
`);
}

function printFlowList(options) {
  const flows = [
    { name: "landing", scope: "Landing page route and public assets" },
    { name: "primary", scope: "Signed-out FXRP setup and FCE readiness" },
    { name: "proof", scope: "Committed proof consistency and Coston2 receipts" },
    { name: "fallback", scope: "Legacy mUSD FCE fallback route" },
  ];
  if (options.json) console.log(JSON.stringify({ schemaVersion: SCHEMA_VERSION, flows }, null, 2));
  else for (const flow of flows) console.log(`${flow.name.padEnd(10)} ${flow.scope}`);
}

function renderHuman(report, options) {
  if (options.quiet) {
    console.log(`${report.result} ${report.summary.fail} failures, ${report.summary.warn} warnings, ${report.summary.skip} skipped`);
    return;
  }
  console.log(`Jorqeth QA: ${report.command}`);
  console.log(`Base URL: ${report.baseUrl}`);
  for (const check of report.checks) {
    const suffix = check.reason ? `, ${check.reason}` : "";
    console.log(`${formatStatus(check.status)} ${check.name} (${check.durationMs} ms)${suffix}`);
    if (options.verbose && check.evidence) console.log(`     ${JSON.stringify(check.evidence)}`);
  }
  console.log(`Result: ${report.result}`);
  console.log(`Summary: ${report.summary.pass} PASS, ${report.summary.fail} FAIL, ${report.summary.warn} WARN, ${report.summary.skip} SKIP`);
  console.log("Artifacts: artifacts/qa/summary.json, artifacts/qa/summary.md, artifacts/qa/junit.xml");
}

async function execute(command, subcommand, options) {
  const report = buildReport(command, options);
  if (command === "doctor") {
    await checkDoctor(report);
  } else if (command === "config") {
    await checkConfig(report);
  } else if (command === "test") {
    await checkTests(report, options, options.full);
  } else if (command === "health") {
    await checkLiveRoutes(report, options);
    await checkApi(report, options);
  } else if (command === "deploy" && subcommand === "check") {
    await checkLiveRoutes(report, options);
    await checkApi(report, options);
    await checkProof(report, options);
  } else if (command === "flow" && subcommand === "run" && options) {
    const flow = options.flow || "primary";
    if (flow === "primary") {
      await checkPrimaryFlow(report, options);
      await checkApi(report, options);
    } else {
      report.checks.push({ id: "flow.unsupported", name: `Product flow ${flow}`, status: "SKIP", durationMs: 0, evidence: { flow }, reason: "Only the read-only primary flow is implemented by this CLI.", suggestedFix: "Add an isolated flow adapter only when its product data can be verified safely." });
    }
  } else if (command === "qa") {
    await checkConfig(report);
    await checkSourceDrift(report);
    await checkTests(report, options, options.full);
    await checkLiveRoutes(report, options);
    await checkApi(report, options);
    await checkPrimaryFlow(report, options);
    await checkProof(report, options);
  } else {
    printHelp();
    return null;
  }

  report.finishedAt = new Date().toISOString();
  report.summary = summaryFor(report);
  report.result = report.summary.fail > 0 ? "FAIL" : "PASS";
  report.exitCode = report.summary.fail > 0 ? 1 : 0;
  writeArtifacts(report);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else renderHuman(report, options);
  return report;
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  const { command, subcommand, options } = parsed;
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "flow" && subcommand === "list") {
    printFlowList(options);
    return;
  }
  if (command === "report") {
    const path = join(ARTIFACT_DIR, "summary.json");
    if (!existsSync(path)) {
      console.error("No QA report exists yet. Run npm run qa first.");
      process.exitCode = 1;
      return;
    }
    const report = readFileSync(path, "utf8");
    console.log(options.json ? report : `Latest report\n\n${report}`);
    return;
  }

  const report = await execute(command, subcommand, options);
  if (report) process.exitCode = report.exitCode;
}

await main();
