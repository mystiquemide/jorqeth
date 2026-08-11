// Verification replay controller. Fetches the committed evidence, builds the
// pure view-model, and binds it into the static DOM. No framework, no build step.
//
// Security posture: every value goes into the DOM via textContent (never
// innerHTML), so the evidence JSON is treated as untrusted data and cannot inject
// markup. The page performs no chain call, no trigger, and no write of any kind.

import { buildPage, shortAddr } from "./view.js";

/** Resolve a dotted path like "eligible.creatorAfter" against the page model. */
function pick(model, path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), model);
}

function bindText(root, model) {
  for (const el of root.querySelectorAll("[data-bind]")) {
    const v = pick(model, el.getAttribute("data-bind"));
    if (v !== undefined && v !== null) el.textContent = String(v);
  }
}

function bindAddr(root, model) {
  for (const el of root.querySelectorAll("[data-bind-addr]")) {
    const v = pick(model, el.getAttribute("data-bind-addr"));
    if (typeof v === "string") {
      el.textContent = shortAddr(v);
      el.title = v; // full value on hover / for copy
    }
  }
}

function bindFlags(root, model) {
  for (const el of root.querySelectorAll("[data-bind-flag]")) {
    const v = pick(model, el.getAttribute("data-bind-flag"));
    el.textContent = v ? "All five sources agree." : "Sources disagree - see evidence.";
    el.classList.toggle("ok", !!v);
    el.classList.toggle("bad", !v);
  }
}

function bindRows(root, model) {
  for (const el of root.querySelectorAll("[data-rows]")) {
    const rows = pick(model, el.getAttribute("data-rows"));
    el.replaceChildren();
    if (!Array.isArray(rows)) continue;
    for (const [label, amount] of rows) {
      const tr = document.createElement("tr");
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = label;
      const td = document.createElement("td");
      td.textContent = amount;
      tr.append(th, td);
      el.appendChild(tr);
    }
  }
}

function renderMatrix(model) {
  const host = document.querySelector("[data-cards='negatives']");
  const tpl = document.getElementById("card-tpl");
  if (!host || !tpl) return;
  host.replaceChildren();
  for (const c of model.negatives) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.tone = c.state.tone;
    node.querySelector(".mlabel").textContent = c.label.replace(/_/g, " ");
    const pill = node.querySelector(".pill");
    pill.textContent = c.state.label;
    node.querySelector(".mexplain").textContent = c.explain;
    const outcome = node.querySelector(".moutcome");
    if (c.paid) {
      outcome.textContent = `Paid +${c.creatorDelta} mUSD`;
    } else if (c.revertedWith) {
      outcome.textContent = `Reverted ${c.revertedWith} · paid 0`;
    } else {
      outcome.textContent = `Returned · paid 0 · settled`;
    }
    host.appendChild(node);
  }
}

async function loadJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function main() {
  try {
    // Served from the repo root, so evidence is one level up from /web/.
    const [pos, neg] = await Promise.all([
      loadJson("../evidence/positive-proof.json"),
      loadJson("../evidence/negative-proof.json"),
    ]);
    const model = buildPage(pos, neg);
    bindText(document, model);
    bindAddr(document, model);
    bindFlags(document, model);
    bindRows(document, model);
    renderMatrix(model);
    document.body.dataset.ready = "true";
  } catch (err) {
    const box = document.getElementById("load-error");
    if (box) {
      box.hidden = false;
      box.textContent = `Could not load proof evidence (${err.message}). Run bash evidence/run-proof-gate.sh and serve from the repository root.`;
    }
    document.body.dataset.ready = "error";
  }
}

main();
