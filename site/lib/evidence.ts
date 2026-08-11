// Jorqeth evidence layer. Reads the committed proof JSON (vendored from the
// repo's /evidence and /spec) and exposes typed view-models. Every figure the
// app shows traces to one of these files, nothing is invented.

import positive from "@/data/positive-proof.json";
import negative from "@/data/negative-proof.json";
import gate from "@/data/proof-gate.json";
import spec from "@/data/jorqeth-v1.json";

export type Category = "paid" | "zero" | "retry" | "reject";

export interface LedgerRow {
  label: string;
  title: string;
  category: Category;
  plain: string;
  amount: number; // creator delta, 6dp micros
  error: string;
  idx: number;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  paid: "Paid",
  zero: "Settled, zero",
  retry: "Retryable",
  reject: "Rejected",
};

// Real-world meaning for each proof vector label.
const META: Record<string, { title: string; category: Category; plain: string }> = {
  eligible_positive: { title: "Eligible sale", category: "paid", plain: "A real eligible sale. Pays the exact commission, once." },
  refund_ineligible: { title: "Refunded sale", category: "zero", plain: "A valid evaluation that owes nothing. Settled, pays zero." },
  infrastructure_unknown: { title: "Could not decide", category: "retry", plain: "The system was unsure, so it paid nothing and stayed retryable." },
  error_status: { title: "Evaluator error", category: "retry", plain: "An error result. Reverts and can be retried, never pays." },
  fleet_outage: { title: "Compute fleet offline", category: "retry", plain: "No active signer available. The payable path halts, escrow intact." },
  replay: { title: "Replay attempt", category: "reject", plain: "The same eligible result, submitted twice. Cannot pay again." },
  wrong_domain_chain: { title: "Wrong chain", category: "reject", plain: "A result bound to a different chain id. Rejected." },
  wrong_domain_contract: { title: "Wrong contract", category: "reject", plain: "A result bound to a different settlement contract. Rejected." },
  untrusted_signer: { title: "Untrusted signer", category: "reject", plain: "Signed by a key that is not a registered node. Rejected." },
  tampered_amount: { title: "Tampered amount", category: "reject", plain: "The amount was changed after signing. Verification breaks." },
  tampered_creator: { title: "Tampered recipient", category: "reject", plain: "The recipient was changed after signing. Verification breaks." },
  expired: { title: "Expired result", category: "reject", plain: "A result past its validity window. Cannot pay." },
};

// Format 6-decimal escrow-token micros as a human amount.
export function usd(micros: number | string): string {
  const n = Number(micros);
  if (!isFinite(n)) return "0.000000";
  return (n / 1e6).toLocaleString("en-US", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  });
}

export function shortHash(h: string | undefined, head = 10, tail = 8): string {
  if (!h) return "";
  if (h.length <= head + tail) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}

export const positiveProof = positive;
export const negativeProof = negative;
export const proofGate = gate;
export const jorqethSpec = spec;

// ---- typed views over the positive proof (the real settled payout) ----

export interface Deployment {
  settlement: string;
  escrowToken: string;
  teeRegistry: string;
  fccVerifier: string;
  verifierMode: string;
  merchant: string;
  creator: string;
  teeId: string;
  extensionId: number;
}

export function deployment(): Deployment {
  return positive.deployment as unknown as Deployment;
}

export function payout() {
  const p = positive as unknown as {
    order: { instructionId: string; orderDigest: string; eligibility: string };
    transactions: {
      fund: string;
      settle: string;
      settleBlock: number;
      settleStatus: string;
      settleGasUsed: number;
    };
    balances: {
      escrowBefore: number;
      escrowAfter: number;
      escrowDelta: number;
      creatorBefore: number;
      creatorAfter: number;
      creatorDelta: number;
      totalSettled: number;
      orderSettled: boolean;
    };
  };
  return { order: p.order, tx: p.transactions, balances: p.balances };
}

// The 12-path invariant: how many paths were attempted, how many moved value.
export function invariant() {
  const v = (negative as unknown as {
    invariant: {
      paths_attempted: number;
      paths_that_transferred_value: number;
      creator_final: number;
      escrow_final: number;
      total_settled: number;
      only_eligible_path_paid: boolean;
    };
  }).invariant;
  return v;
}

// Campaign + rule terms, frozen in the spec.
export function campaign() {
  const c = (spec as unknown as {
    campaign: {
      campaignLabel: string;
      commissionBps: number;
      ruleVersionLabel: string;
      dataSourceLabel: string;
      escrowAmount: number;
    };
    rounding: { formula: string; rule: string };
    escrowToken: { symbol: string; decimals: number };
  });
  return { ...c.campaign, rounding: c.rounding, token: c.escrowToken };
}

// The full 12-path ledger, ordered paid -> zero -> retry -> reject.
export function ledger(): LedgerRow[] {
  const rows: LedgerRow[] = (negative.vectors as Array<Record<string, unknown>>).map((v) => {
    const label = String(v.label);
    const m = META[label] ?? { title: label, category: "reject" as Category, plain: "" };
    return {
      label,
      title: m.title,
      category: m.category,
      plain: m.plain,
      amount: Number(v.creatorDelta),
      error: String(v.expectedError),
      idx: Number(v.idx),
    };
  });

  const fo = negative.fleet_outage as { creatorDelta: number; expectedError: string } | undefined;
  if (fo) {
    const m = META.fleet_outage;
    rows.push({
      label: "fleet_outage",
      title: m.title,
      category: m.category,
      plain: m.plain,
      amount: Number(fo.creatorDelta),
      error: String(fo.expectedError),
      idx: 11,
    });
  }

  const order: Record<Category, number> = { paid: 0, zero: 1, retry: 2, reject: 3 };
  return rows.sort((a, b) => order[a.category] - order[b.category] || a.idx - b.idx);
}

// Counts for headline stats, all derived from the real proof.
export function ledgerSummary() {
  const rows = ledger();
  return {
    total: rows.length,
    paid: rows.filter((r) => r.category === "paid").length,
    zero: rows.filter((r) => r.category === "zero").length,
    retry: rows.filter((r) => r.category === "retry").length,
    reject: rows.filter((r) => r.category === "reject").length,
  };
}

// Proof-gate headline counts, straight from the committed gate artifact.
export function gateSummary() {
  const s = (gate as { summary: Record<string, number | string> }).summary;
  return {
    checklistPassed: Number(s.checklist_items_passed),
    checklistTotal: Number(s.checklist_items_total),
    forgePassed: Number(s.forge_tests_passed),
    forgeFailed: Number(s.forge_tests_failed),
    privacyFindings: Number(s.privacy_scan_findings),
    result: String((gate as { result: string }).result),
  };
}

// The five independent amount sources that agree, straight from the proof.
export function amountAgreement() {
  const a = positive.exact_amount_agreement as Record<string, number | boolean>;
  return {
    netApplied: Number(a.netApplied),
    commissionBps: Number(a.commissionBps),
    sources: [
      { label: "Configured formula floor(net × rate)", value: Number(a.configuredFormula_floor_net_bps_over_10000) },
      { label: "Compatibility result amount", value: Number(a.fccResultAmount) },
      { label: "On-chain Settled event", value: Number(a.settledEventAmount) },
      { label: "Creator balance delta", value: Number(a.creatorBalanceDelta) },
      { label: "Escrow balance delta", value: Number(a.escrowBalanceDelta) },
    ],
    allEqual: Boolean(a.all_equal),
  };
}
