// Browser smoke test for the verification replay page. Boots the static server, loads the page
// in headless chromium, and asserts against BOTH scenarios, mobile width, keyboard
// focus, and a rendered-DOM secret scan. Playwright is resolved from the global
// install (no local node_modules in this repo).
//
//   node web/smoke.mjs
//
// Exit 0 = pass. Any failed assertion exits 1 with the reason.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { startServer } from "./smoke-server.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const globalRoot = execSync("npm root -g").toString().trim();
const { chromium } = require(join(globalRoot, "playwright"));

// The globally-installed browser build can differ from what the module bundles,
// so resolve the actual chromium executable on disk and launch that directly.
function findChromium() {
  const envPath = process.env.PLAYWRIGHT_CHROMIUM || process.env.CHROME_PATH;
  if (envPath && existsSync(envPath)) return envPath;
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(cache)) return null;
  const dirs = readdirSync(cache).filter((d) => d.startsWith("chromium-"));
  for (const d of dirs) {
    const p = join(cache, d, "chrome-linux64", "chrome");
    if (existsSync(p)) return p;
  }
  return null;
}
const executablePath = findChromium();

const POS = JSON.parse(readFileSync(join(here, "..", "evidence", "positive-proof.json"), "utf8"));
const NEG = JSON.parse(readFileSync(join(here, "..", "evidence", "negative-proof.json"), "utf8"));

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

function wait(ms) {
  // deterministic-enough sleep without a timer dependency
  const end = Date.now() + ms;
  return new Promise((r) => {
    const t = setInterval(() => { if (Date.now() >= end) { clearInterval(t); r(); } }, 20);
  });
}

// Spawn the static server on a free port, confirmed to be this checkout (REV-006).
const { base: BASE, stop: stopServer } = await startServer();

async function run() {
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    // ---- desktop ----
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const bad = [];
    page.on("console", (m) => { if (m.type() === "error") bad.push(m.text()); });
    await page.goto(`${BASE}/web/index.html`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.body.dataset.ready === "true", { timeout: 5000 })
      .catch(() => {});

    const ready = await page.evaluate(() => document.body.dataset.ready);
    ok(ready === "true", `page did not become ready (state=${ready})`);
    ok(bad.length === 0, `console errors: ${bad.join(" | ")}`);

    const bodyText = await page.evaluate(() => document.body.innerText);

    // eligible: exact commission + creator delta present and real
    ok(bodyText.includes("20.000000"), "eligible commission 20.000000 not shown");
    ok(bodyText.includes("100.000000"), "escrow funded 100.000000 not shown");
    ok(bodyText.includes("80.000000"), "escrow after 80.000000 not shown");
    ok(bodyText.includes("simulated-attestation"), "verifier mode not disclosed");
    ok(/replay mode/i.test(bodyText), "replay-mode banner missing");
    ok(/synthetic data/i.test(bodyText), "synthetic-data label missing");

    // matrix: one paid card, and the distinct states are all present
    const cardCount = await page.locator("#matrix .mcard").count();
    ok(cardCount === NEG.vectors.length + 1, `matrix cards=${cardCount} expected ${NEG.vectors.length + 1}`);
    const paidCards = await page.locator("#matrix .mcard[data-tone='pay']").count();
    ok(paidCards === 1, `exactly one paid card expected, got ${paidCards}`);
    for (const tone of ["zero", "retry", "block"]) {
      const n = await page.locator(`#matrix .mcard[data-tone='${tone}']`).count();
      ok(n >= 1, `expected at least one '${tone}' card`);
    }
    // replay reads as a blocked/already-settled state, not a refund
    const replayText = await page.locator("#matrix .mcard", { hasText: "replay" }).innerText();
    ok(/already settled/i.test(replayText), "replay not shown as already-settled");
    ok(/AlreadySettled/.test(replayText), "replay revert reason missing");

    // links resolve (no placeholder)
    const links = await page.locator("#evidence-links a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    for (const href of links) {
      const r = await fetch(new URL(href.replace("../", "/"), BASE));
      ok(r.ok, `evidence link ${href} did not resolve (${r.status})`);
    }

    // keyboard: skip-link is the first tab stop and focus is visible
    await page.keyboard.press("Tab");
    const firstFocus = await page.evaluate(() => document.activeElement?.className || "");
    ok(/skip-link/.test(firstFocus), `first tab stop should be skip link, was '${firstFocus}'`);

    // rendered-DOM secret scan
    const lower = bodyText.toLowerCase();
    for (const bad of ["cardnumber", "cvv", "ssn", "mnemonic", "password", "private key", "0xac0974"]) {
      ok(!lower.includes(bad), `prohibited token '${bad}' rendered on page`);
    }

    // ---- mobile 360px: no horizontal overflow ----
    await page.setViewportSize({ width: 360, height: 720 });
    await wait(150);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    ok(overflow <= 1, `horizontal overflow at 360px: ${overflow}px`);

    await page.close();
  } finally {
    await browser.close();
  }
}

run()
  .catch((e) => fails.push(`smoke threw: ${e.stack || e}`))
  .finally(() => {
    stopServer();
    if (fails.length) {
      console.error("SMOKE FAILED:\n - " + fails.join("\n - "));
      process.exit(1);
    }
    console.log("SMOKE PASSED: both scenarios, 360px, keyboard, link readback, secret scan");
    process.exit(0);
  });
