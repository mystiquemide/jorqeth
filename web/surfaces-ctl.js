// Controllers for the three Milestone 8 amplification surfaces. Each fetches the same
// committed evidence + frozen spec the demo uses, builds a pure view-model from
// surfaces.js, and binds it into static DOM through textContent only (never innerHTML),
// so the evidence/config is treated as untrusted data and can inject no markup. No
// surface writes anything, calls a chain, or triggers anything.

import {
  receiptView,
  allReceipts,
  inspectorView,
  briefFacts,
  DEFAULT_RECEIPT,
  RECEIPTS,
  shortAddr,
} from "./surfaces.js";

async function loadJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/** Load the two proofs and the frozen spec, served from the repo root (one level up). */
async function loadAll() {
  return Promise.all([
    loadJson("../evidence/positive-proof.json"),
    loadJson("../evidence/negative-proof.json"),
    loadJson("../spec/jorqeth-v1.json"),
  ]);
}

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
      el.title = v;
    }
  }
}

function bindHref(root, model) {
  for (const el of root.querySelectorAll("[data-bind-href]")) {
    const v = pick(model, el.getAttribute("data-bind-href"));
    if (typeof v === "string") el.setAttribute("href", v);
  }
}

function showError(err) {
  const box = document.getElementById("load-error");
  if (box) {
    box.hidden = false;
    box.textContent = `Could not load proof evidence (${err.message}). Run bash evidence/run-proof-gate.sh and serve from the repository root.`;
  }
  document.body.dataset.ready = "error";
}

/** Append a plain <li> with text to a <ul>/<ol> host, safely. */
function appendItems(host, items) {
  host.replaceChildren();
  for (const text of items) {
    const li = document.createElement("li");
    li.textContent = text;
    host.appendChild(li);
  }
}

// ---- Surface 1: settlement receipt --------------------------------------------------

function currentReceiptKey() {
  const q = new URLSearchParams(location.search).get("r");
  return RECEIPTS.some((r) => r.key === q) ? q : DEFAULT_RECEIPT;
}

export async function renderReceipt() {
  try {
    const [pos, neg, spec] = await loadAll();
    const key = currentReceiptKey();
    const model = receiptView(key, pos, neg, spec);
    const all = allReceipts(pos, neg, spec);

    // Outcome tone on the receipt shell so eligible/refund/replay/infra read distinctly.
    document.body.dataset.tone = model.tone;
    document.getElementById("receipt").dataset.tone = model.tone;

    bindText(document, model);
    bindAddr(document, model);

    // Payout line: show the signed amount and whether value moved, in words + color.
    const paidEl = document.getElementById("paid-flag");
    if (paidEl) {
      paidEl.textContent = model.paid
        ? "Value moved on-chain"
        : model.retryable
          ? "No payout — retryable, digest not consumed"
          : "No payout — terminal";
      paidEl.dataset.tone = model.tone;
    }

    // Rows that only exist for a paid receipt: hide them cleanly otherwise (no empty cells).
    for (const el of document.querySelectorAll("[data-when-paid]")) {
      el.hidden = !model.paid;
    }
    for (const el of document.querySelectorAll("[data-when-revert]")) {
      el.hidden = !model.revertReason;
    }

    // Receipt switcher: one link per approved run, current one marked, deep-linkable.
    const nav = document.getElementById("receipt-switch");
    if (nav) {
      nav.replaceChildren();
      for (const r of all) {
        const a = document.createElement("a");
        a.href = `?r=${r.key}`;
        a.textContent = r.outcome;
        a.className = "rtab";
        a.dataset.tone = r.tone;
        if (r.key === key) {
          a.setAttribute("aria-current", "true");
        }
        nav.appendChild(a);
      }
    }

    document.body.dataset.ready = "true";
  } catch (err) {
    showError(err);
  }
}

// ---- Surface 2: FCC proof inspector -------------------------------------------------

export async function renderInspector() {
  try {
    const [pos, neg, spec] = await loadAll();
    const model = inspectorView(pos, neg, spec);
    bindText(document, model);
    bindAddr(document, model);
    bindHref(document, model);

    // Verification chain steps.
    const chainHost = document.getElementById("chain");
    if (chainHost) {
      chainHost.replaceChildren();
      model.chain.forEach((c, i) => {
        const li = document.createElement("li");
        li.className = "chain-step";
        const h = document.createElement("h3");
        h.textContent = `${i + 1}. ${c.step}`;
        const p = document.createElement("p");
        p.textContent = c.detail;
        li.append(h, p);
        chainHost.appendChild(li);
      });
    }

    // Bound fields (name + on-chain type), from the frozen result type string.
    const boundHost = document.getElementById("bound-fields");
    if (boundHost) {
      boundHost.replaceChildren();
      for (const f of model.boundFields) {
        const li = document.createElement("li");
        const name = document.createElement("span");
        name.className = "bf-name";
        name.textContent = f.name;
        const type = document.createElement("code");
        type.textContent = f.type;
        li.append(name, document.createTextNode(" "), type);
        boundHost.appendChild(li);
      }
    }

    const withheldHost = document.getElementById("withheld-fields");
    if (withheldHost) {
      withheldHost.replaceChildren();
      for (const text of model.withheldFields) {
        const li = document.createElement("li");
        // A real, screen-reader-visible "withheld" tag, not CSS ::before content, so the
        // status survives in the accessibility tree and in rendered-text checks.
        const tag = document.createElement("span");
        tag.className = "wh-tag";
        tag.textContent = "withheld";
        const label = document.createElement("span");
        label.textContent = text;
        li.append(tag, document.createTextNode(" "), label);
        withheldHost.appendChild(li);
      }
    }

    document.body.dataset.ready = "true";
  } catch (err) {
    showError(err);
  }
}

// ---- Surface 3: trust / product brief -----------------------------------------------

export async function renderBrief() {
  try {
    const [pos, , spec] = await loadAll();
    const model = briefFacts(pos, spec);
    bindText(document, model);
    bindAddr(document, model);
    bindHref(document, model);

    const lists = {
      "security-list": model.security,
      "limitations-list": model.limitations,
      "roadmap-list": model.roadmap,
      "newwork-list": model.newWork,
      "scaffold-list": model.inheritedScaffold,
    };
    for (const [id, items] of Object.entries(lists)) {
      const host = document.getElementById(id);
      if (host) appendItems(host, items);
    }

    document.body.dataset.ready = "true";
  } catch (err) {
    showError(err);
  }
}
