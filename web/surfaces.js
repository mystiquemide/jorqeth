// Pure view-models for the three Milestone 8 judge-amplifying surfaces:
//   1. Settlement receipt   (receipt.html)   — did the system produce the claimed outcome?
//   2. FCC proof inspector   (inspector.html) — why is Flare Confidential Compute load-bearing?
//   3. Trust / product brief (brief.html)     — what is the product and where can it go?
//
// Same rules as view.js: no DOM, no fetch, no framework. Every function takes the
// committed Milestone 5 evidence (evidence/positive-proof.json,
// evidence/negative-proof.json) plus the frozen campaign config
// (spec/jorqeth-v1.json — the authoritative source M1-M5 already derive from, not a
// second source of truth) and returns a plain object the surface renders through
// textContent only. A surface can never show a number the proof/config does not contain.
//
// These surfaces are READ-ONLY amplification. They add no write path, no new actor,
// no fabricated metric, and never hardcode a transaction success: the eligible tx
// status is read straight from the positive proof.

import { formatMusd, shortAddr, classifyVector, STATES } from "./view.js";

export { formatMusd, shortAddr };

/** Stable receipt/schema identifiers for the shareable receipt artifact. */
export const RECEIPT_VERSION = "jorqeth.receipt.v1";

/**
 * The four approved proof runs a receipt can be issued for, in demo order. Each maps
 * to a real order digest in spec.orders and a real outcome proven by the evidence:
 *  - eligible + replay reuse ORDER-A (the paid order, then re-submitted);
 *  - refund is ORDER-B (a genuine refunded record);
 *  - infra-unknown is ORDER-C (evaluator could not decide, code 2, retryable).
 */
export const RECEIPTS = [
  { key: "eligible", specOrder: "ORDER-A", vector: "eligible_positive", source: "positive" },
  { key: "refund", specOrder: "ORDER-B", vector: "refund_ineligible", source: "negative" },
  { key: "replay", specOrder: "ORDER-A", vector: "replay", source: "negative" },
  { key: "infra", specOrder: "ORDER-C", vector: "infrastructure_unknown", source: "negative" },
];

export const DEFAULT_RECEIPT = "eligible";

/** Look up one negative-proof vector by its label. Throws if the fixture lacks it. */
export function pickVector(neg, label) {
  const v = neg.vectors.find((x) => x.label === label);
  if (!v) throw new Error(`negative proof missing vector '${label}'`);
  return v;
}

/**
 * Campaign/config facts shared by every surface, read from the frozen spec and the
 * positive proof. Kept in one place so a network/mode/version label can never drift
 * between surfaces.
 */
export function configFacts(pos, spec) {
  return {
    specVersion: spec.specVersion,
    schemaVersion: spec.schemaVersion,
    campaignId: spec.campaign.campaignId,
    campaignLabel: spec.campaign.campaignLabel,
    commissionBps: spec.campaign.commissionBps,
    commissionPercent: (spec.campaign.commissionBps / 100).toString(),
    ruleVersion: spec.campaign.ruleVersion,
    ruleVersionLabel: spec.campaign.ruleVersionLabel,
    dataSourceLabel: spec.campaign.dataSourceLabel,
    escrowSymbol: spec.escrowToken.symbol,
    escrowDecimals: spec.escrowToken.decimals,
    network: pos.chain,
    settlement: pos.deployment.settlement,
    fccVerifier: pos.deployment.fccVerifier,
    teeRegistry: pos.deployment.teeRegistry,
    teeId: pos.deployment.teeId,
    creator: pos.deployment.creator,
    extensionId: pos.deployment.extensionId,
    verifierMode: pos.deployment.verifierMode,
    // The mode label is honest about attestation: simulated on the local devnet.
    attestation: /simulated/i.test(pos.deployment.verifierMode) ? "simulated" : "production",
  };
}

/**
 * Build one shareable settlement receipt. `key` is one of RECEIPTS[].key. Every value
 * is derived from the proof/config; nothing about success is hardcoded. Infrastructure
 * unknown is rendered as its own outcome, never as eligible, ineligible, or successful.
 */
export function receiptView(key, pos, neg, spec) {
  if (pos.result !== "PASS") throw new Error(`positive proof not PASS: ${pos.result}`);
  if (neg.result !== "PASS") throw new Error(`negative proof not PASS: ${neg.result}`);
  const def = RECEIPTS.find((r) => r.key === key);
  if (!def) throw new Error(`unknown receipt '${key}'`);

  const cfg = configFacts(pos, spec);
  const order = spec.orders[def.specOrder];
  if (!order) throw new Error(`spec missing order '${def.specOrder}'`);

  const base = {
    receiptVersion: RECEIPT_VERSION,
    schemaVersion: cfg.schemaVersion,
    specVersion: cfg.specVersion,
    campaignId: cfg.campaignId,
    campaignLabel: cfg.campaignLabel,
    orderDigest: order.orderDigest,
    creator: cfg.creator,
    network: cfg.network,
    settlement: cfg.settlement,
    verifierMode: cfg.verifierMode,
    attestation: cfg.attestation,
    extensionId: cfg.extensionId,
    ruleVersion: cfg.ruleVersion,
    ruleVersionLabel: cfg.ruleVersionLabel,
    commissionBps: cfg.commissionBps,
    commissionPercent: cfg.commissionPercent,
    escrowSymbol: cfg.escrowSymbol,
    synthetic: "Synthetic record, testnet values only. No real customer or merchant data.",
    claimBoundary: "Settles what the agreed merchant record shows, not universal attribution truth.",
  };

  if (def.source === "positive") {
    const b = pos.balances;
    const state = STATES.ELIGIBLE;
    return {
      ...base,
      key,
      outcome: state.label,
      outcomeKey: state.key,
      tone: state.tone,
      paid: true,
      terminal: state.terminal,
      payout: formatMusd(b.creatorDelta),
      payoutSigned: `+${formatMusd(b.creatorDelta)}`,
      creatorBefore: formatMusd(b.creatorBefore),
      creatorAfter: formatMusd(b.creatorAfter),
      instructionId: pos.order.instructionId,
      settleTx: pos.transactions.settle,
      settleStatus: pos.transactions.settleStatus,
      settleGasUsed: pos.transactions.settleGasUsed,
      revertReason: null,
      retryable: false,
      digestConsumed: true,
      // Local anvil devnet has no public block explorer (BLK-001/BLK-002); the tx hash
      // is the on-chain reference and the positive proof is the verifiable artifact.
      explorer: null,
      explorerNote: "Local anvil devnet — no public block explorer. Verify via the committed positive proof.",
      evidenceHref: "../evidence/positive-proof.md",
    };
  }

  const v = pickVector(neg, def.vector);
  const state = classifyVector(v);
  const reverts = v.expectedError && v.expectedError !== "none" ? v.expectedError : null;
  return {
    ...base,
    key,
    outcome: state.label,
    outcomeKey: state.key,
    tone: state.tone,
    paid: false,
    terminal: state.terminal,
    payout: formatMusd(v.creatorDelta),
    payoutSigned: formatMusd(v.creatorDelta),
    creatorBefore: null,
    creatorAfter: null,
    instructionId: null,
    settleTx: null,
    settleStatus: reverts ? "reverted" : "returned",
    settleGasUsed: null,
    revertReason: reverts,
    retryable: state.terminal === false,
    digestConsumed: state.terminal === true,
    explorer: null,
    explorerNote: reverts
      ? "No settlement transaction — settle() reverted and moved no value."
      : "No payout transaction — a terminal zero settlement.",
    evidenceHref: "../evidence/negative-proof.md",
  };
}

/** All receipts, in demo order, for the receipt index / prev-next navigation. */
export function allReceipts(pos, neg, spec) {
  return RECEIPTS.map((r) => receiptView(r.key, pos, neg, spec));
}

/**
 * The FCC proof inspector view-model: the minimal public verification chain, the fields
 * the signed result BINDS, the private fields it intentionally withholds, the honestly
 * labelled attestation mode, and the links a judge can follow. Bound fields are parsed
 * from the frozen result type string so they are exactly the on-chain schema, not prose.
 */
export function inspectorView(pos, neg, spec) {
  const cfg = configFacts(pos, spec);

  // Parse "PayableResult(uint16 schemaVersion,bytes32 campaignId,...)" into (type,name).
  const inside = (spec.eip712.resultTypeString.match(/\(([^)]*)\)/) || [null, ""])[1];
  const boundFields = inside
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const [type, name] = pair.split(/\s+/);
      return { name, type };
    });

  // Private inputs that stay inside the confidential extension and never appear in any
  // published result, event, or tracked file. Static product documentation, labelled.
  const withheldFields = [
    "Customer identity and contact details",
    "Raw order line items and product data",
    "Gross revenue and payment method",
    "The merchant API endpoint and its credential",
    "Any record for an order other than the one being settled",
  ];

  const chain = [
    {
      step: "Agreed merchant source",
      detail:
        "Merchant and creator agree in advance on the record source and rule. The synthetic merchant API holds the private order ledger.",
    },
    {
      step: "Private FCE evaluation",
      detail:
        "A Flare Compute Extension reads that source confidentially inside a TEE and evaluates the order against the campaign rule. No private field leaves the enclave.",
    },
    {
      step: "Minimal domain-bound result",
      detail:
        "The extension emits only a PayableResult: the eligibility code and exact amount, bound to campaign, order digest, creator, chain, contract, rule version, and a validity window, signed by the TEE.",
    },
    {
      step: "Contract verification",
      detail:
        "JorqethSettlement reconstructs the exact hash the TEE node signs, recovers the signer, and accepts the result only if that signer is a currently-active teeId in the on-chain registry for this extension.",
    },
    {
      step: "Exact payout or zero",
      detail:
        "An eligible result releases exactly the bound commission to the bound creator, once. Every other outcome pays zero: a refund is terminal, and uncertainty reverts and stays retryable.",
    },
  ];

  return {
    ...cfg,
    boundFields,
    withheldFields,
    chain,
    // Honest attestation copy: never claim hardware-backed production confidentiality
    // when the run used a simulated TEE on the local devnet.
    attestationCopy:
      cfg.attestation === "simulated"
        ? "Simulated attestation on a local anvil devnet. The TEE signature scheme is reproduced byte-for-byte from real Flare tee-node code and verified on-chain; a production Confidential Space round trip on Coston2 is externally blocked (BLK-001/BLK-002)."
        : "Production Confidential Space attestation.",
    genuineness:
      "Signature genuineness is proven separately and permanently: tools/tee-signer produces a real tee-node vector and contracts/test/FccRealSignature.t.sol verifies it against the same FccResultVerifier the demo uses.",
    links: {
      settlement: cfg.settlement,
      verifier: cfg.fccVerifier,
      teeRegistry: cfg.teeRegistry,
      teeId: cfg.teeId,
      instructionId: pos.order.instructionId,
      settleTx: pos.transactions.settle,
      verifierSource: "../contracts/src/FccResultVerifier.sol",
      signerSource: "../tools/tee-signer/main.go",
      spec: "../spec/jorqeth-v1.json",
      positiveEvidence: "../evidence/positive-proof.md",
      negativeEvidence: "../evidence/negative-proof.md",
    },
    onlyEligiblePaid: neg.invariant.only_eligible_path_paid === true,
    pathsAttempted: neg.invariant.paths_attempted,
    pathsThatPaid: neg.invariant.paths_that_transferred_value,
  };
}

/**
 * Trust / product brief facts. Mostly static product documentation, but the live
 * network, contract, mode, and version labels are pulled from config so the brief can
 * never overstate the proven deployment.
 */
export function briefFacts(pos, spec) {
  const cfg = configFacts(pos, spec);
  return {
    ...cfg,
    targetUser:
      "Merchants running creator or affiliate commission programs, and the creators owed those commissions.",
    problem:
      "A creator owed a commission cannot inspect a merchant's private order ledger, and the merchant cannot publish customer and revenue data just to make the payout credible.",
    model:
      "The merchant funds an escrow and fixes the rule up front. A confidential extension evaluates each sale against that rule and returns only a minimal signed result. The contract releases the exact eligible commission and pays zero for every negative or unknown case.",
    positiveGuarantee:
      "A valid, unexpired, correctly domain-bound result for an eligible record releases exactly the bound amount, to the bound creator, once.",
    negativeGuarantee:
      "No such result means no commission can leave escrow. Refunds pay zero and are terminal; replay, wrong domain, expiry, untrusted signer, tampering, and infrastructure-unknown all fail closed.",
    security: [
      "Domain binding: a result is bound to chain, settlement contract, campaign, order, creator, amount, rule version, and validity window.",
      "Replay prevention: a settled order digest is consumed and cannot pay twice.",
      "Fail-closed: uncertainty and every malformed or unauthorized result revert and move no value.",
      "Redaction: order references are opaque digests; no credential, key, or customer field appears in any result, event, or tracked file.",
    ],
    limitations: [
      "Merchant-source dependence: Jorqeth settles what the agreed record shows, not objective attribution outside that source.",
      "Fixed refund snapshot: the refund/eligibility state is evaluated at settlement time, not reconciled against later disputes.",
      "One connector: a single synthetic merchant record source is wired, not a production commerce integration.",
      "Non-production FCC: the run uses simulated attestation on a local devnet; a live Coston2 Confidential Space round trip is externally blocked.",
    ],
    roadmap: [
      "Production secret delivery: an off-chain confidential channel to hand the extension its merchant credential under real attestation.",
      "Merchant pilot connector: one real commerce platform record source behind the same minimal-result boundary.",
      "Settlement-window and refund finality: a dispute/settlement window before a payout becomes irreversible.",
    ],
    newWork: [
      "JorqethSettlement: escrow, domain binding, replay guard, exact/zero payout.",
      "FccResultVerifier: reconstructs and verifies the real TEE ActionResult signature against the active on-chain teeId set.",
      "The frozen spec, golden vectors, and the full positive/negative on-chain proofs.",
      "tools/tee-signer and the FccRealSignature test that pin the signing scheme byte-for-byte.",
      "The judge page and these three amplification surfaces.",
    ],
    inheritedScaffold: [
      "The Flare tee-node / go-flare-common ActionResult signing scheme, reproduced and pinned (not modified).",
      "The Flare Compute Extension model and Confidential Space concepts.",
      "OpenZeppelin ERC-20 and access primitives, and Foundry/forge-std tooling.",
    ],
    links: {
      repo: "https://github.com/mystiquemide/jorqeth",
      settlement: cfg.settlement,
      spec: "../spec/jorqeth-v1.json",
      positiveEvidence: "../evidence/positive-proof.md",
      negativeEvidence: "../evidence/negative-proof.md",
      proofGate: "../evidence/proof-gate.md",
      readme: "../README.md",
    },
  };
}
