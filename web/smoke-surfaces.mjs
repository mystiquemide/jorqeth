// Browser smoke for the three read-only verification views. Boots the static
// server, loads each view in headless chromium, and asserts real-data rendering,
// deep-link receipt state, signed-out link resolution, a rendered-DOM secret scan,
// 360px no-overflow, and keyboard focus. Mirrors web/smoke.mjs.
//
//   node web/smoke-surfaces.mjs
//
// Exit 0 = pass. Any failed assertion exits 1 with the reason.

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { startServer } from "./smoke-server.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const globalRoot = execSync("npm root -g").toString().trim();
const { chromium } = require(join(globalRoot, "playwright"));

function findChromium() {
  const envPath = process.env.PLAYWRIGHT_CHROMIUM || process.env.CHROME_PATH;
  if (envPath && existsSync(envPath)) return envPath;
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(cache)) return null;
  for (const d of readdirSync(cache).filter((x) => x.startsWith("chromium-"))) {
    const p = join(cache, d, "chrome-linux64", "chrome");
    if (existsSync(p)) return p;
  }
  return null;
}
const executablePath = findChromium();

const POS = JSON.parse(readFileSync(join(here, "..", "evidence", "positive-proof.json"), "utf8"));
const SPEC = JSON.parse(readFileSync(join(here, "..", "spec", "jorqeth-v1.json"), "utf8"));

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

function wait(ms) {
  const end = Date.now() + ms;
  return new Promise((r) => {
    const t = setInterval(() => { if (Date.now() >= end) { clearInterval(t); r(); } }, 20);
  });
}

const SECRETS = ["cardnumber", "cvv", "ssn", "mnemonic", "password", "private key", "0xac0974"];

// Spawn the static server on a free port, confirmed to be this checkout (REV-006).
const { base: BASE, stop: stopServer } = await startServer();

async function run() {
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    page.on("console", (m) => { if (m.type() === "error") fails.push(`console error: ${m.text()}`); });

    async function loadReady(path) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      for (let i = 0; i < 50; i++) {
        const ready = await page.evaluate(() => document.body.dataset.ready);
        if (ready) return ready;
        await wait(50);
      }
      return "timeout";
    }

    async function scanAndLinks(label) {
      const bodyText = (await page.locator("body").innerText()).toLowerCase();
      for (const bad of SECRETS) ok(!bodyText.includes(bad), `${label}: prohibited token '${bad}' rendered`);
      // every anchor with a relative ../ target resolves in a signed-out fetch
      const hrefs = await page.locator("a[href^='../']").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
      for (const href of hrefs) {
        const r = await fetch(new URL(href.replace("../", "/"), BASE));
        ok(r.ok, `${label}: link ${href} did not resolve (${r.status})`);
      }
      // no unresolved placeholder dash left in a VISIBLE data-bound slot. Hidden
      // conditional rows (e.g. a revert reason on a paid receipt) legitimately keep
      // their placeholder; the viewer never sees them, so only visible slots count.
      const stale = await page.locator("[data-bind]").evaluateAll((els) =>
        els.filter((e) => e.offsetParent !== null && e.textContent.trim() === "–").length);
      ok(stale === 0, `${label}: ${stale} visible data-bind slot(s) left unbound`);
      // 360px: no horizontal overflow
      await page.setViewportSize({ width: 360, height: 720 });
      await wait(120);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(overflow <= 1, `${label}: horizontal overflow at 360px (${overflow}px)`);
      await page.setViewportSize({ width: 1200, height: 900 });
      // keyboard: skip-link is the first tab stop
      await page.evaluate(() => document.body.focus());
      await page.keyboard.press("Tab");
      const first = await page.evaluate(() => document.activeElement?.className || "");
      ok(/skip-link/.test(first), `${label}: first tab stop should be skip link, was '${first}'`);
    }

    // ---- receipt: default (eligible) ----
    let ready = await loadReady("/web/receipt.html");
    ok(ready === "true", `receipt default not ready (${ready})`);
    let body = await page.locator("body").innerText();
    ok(body.includes("20.000000"), "receipt: eligible exact payout 20.000000 not shown");
    ok(body.includes(POS.transactions.settle.slice(0, 6)), "receipt: settle tx not shown");
    ok(/simulated-attestation/.test(body), "receipt: verifier mode not disclosed");
    ok(/synthetic record/i.test(body), "receipt: synthetic-data label missing");
    const tone1 = await page.evaluate(() => document.getElementById("receipt").dataset.tone);
    ok(tone1 === "pay", `receipt eligible tone should be pay, was ${tone1}`);
    await scanAndLinks("receipt(eligible)");

    // ---- receipt: infra-unknown deep link, must NOT read as eligible/success ----
    ready = await loadReady("/web/receipt.html?r=infra");
    ok(ready === "true", `receipt infra not ready (${ready})`);
    body = await page.locator("body").innerText();
    ok(/Infrastructure unknown/i.test(body), "receipt infra: outcome label missing");
    ok(/NonPayableCode/.test(body), "receipt infra: revert reason missing");
    ok(!/\+20\.000000/.test(body), "receipt infra: must not show a +20 payout");
    const tone2 = await page.evaluate(() => document.getElementById("receipt").dataset.tone);
    ok(tone2 === "retry", `receipt infra tone should be retry, was ${tone2}`);
    ok(SPEC.orders["ORDER-C"].orderDigest.slice(0, 6) &&
       body.includes(SPEC.orders["ORDER-C"].orderDigest.slice(0, 6)), "receipt infra: ORDER-C digest not shown");

    // ---- receipt: replay deep link reverts AlreadySettled ----
    ready = await loadReady("/web/receipt.html?r=replay");
    body = await page.locator("body").innerText();
    ok(/Already settled/i.test(body), "receipt replay: outcome label missing");
    ok(/AlreadySettled/.test(body), "receipt replay: revert reason missing");

    // ---- inspector ----
    ready = await loadReady("/web/inspector.html");
    ok(ready === "true", `inspector not ready (${ready})`);
    body = await page.locator("body").innerText();
    ok(/Agreed merchant source/.test(body), "inspector: verification chain missing");
    ok(/orderDigest/.test(body), "inspector: bound fields missing");
    ok(/withheld/i.test(body), "inspector: withheld fields not marked");
    ok(/simulated attestation/i.test(body), "inspector: attestation not honestly labelled");
    ok(!/production Confidential Space attestation\./i.test(body), "inspector: must not claim production attestation");
    const steps = await page.locator("#chain .chain-step").count();
    ok(steps === 5, `inspector: expected 5 chain steps, got ${steps}`);
    await scanAndLinks("inspector");

    // ---- brief ----
    ready = await loadReady("/web/brief.html");
    ok(ready === "true", `brief not ready (${ready})`);
    body = await page.locator("body").innerText();
    ok(/merchant-source/i.test(body), "brief: merchant-source limitation missing");
    ok(/What was built/i.test(body), "brief: new-work section missing");
    ok(/roadmap/i.test(body), "brief: roadmap missing");
    ok(/github\.com\/mystiquemide\/jorqeth/.test(body), "brief: repo link missing");
    const secN = await page.locator("#security-list li").count();
    ok(secN >= 3, `brief: expected security controls, got ${secN}`);
    await scanAndLinks("brief");

    // ---- index cross-links to all three surfaces ----
    ready = await loadReady("/web/index.html");
    const ampLinks = await page.locator(".amplify a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    for (const want of ["./receipt.html", "./inspector.html", "./brief.html"]) {
      ok(ampLinks.includes(want), `index: amplify link ${want} missing`);
    }
  } finally {
    await browser.close();
    stopServer();
  }

  if (fails.length) {
    console.error("SURFACES SMOKE FAILED:");
    for (const f of fails) console.error("  - " + f);
    process.exit(1);
  }
  console.log("SURFACES SMOKE PASSED: receipt (eligible/infra/replay), inspector, brief, index cross-links, 360px, keyboard, link readback, secret scan");
}

run().catch((e) => { console.error(e); stopServer(); process.exit(1); });
