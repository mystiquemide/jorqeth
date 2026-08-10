// Pure view-model for the Jorqeth judge page.
//
// No DOM, no fetch, no framework. Every function here takes the committed
// Milestone 5 evidence (evidence/positive-proof.json, evidence/negative-proof.json)
// and returns a plain object the page renders. Keeping this pure means every
// visible state is unit-testable with `node --test` and no browser, and the page
// can never show a number the evidence does not contain.
//
// The page is a READ-ONLY REPLAY of proven state. It does not re-derive
// settlement, call a chain, or trigger anything. If the evidence JSON is wrong,
// the page is visibly wrong; that is the point.

/** mUSD has 6 decimals. Format an integer base-unit amount as a decimal string. */
export function formatMusd(baseUnits) {
  const n = BigInt(baseUnits);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const whole = abs / 1000000n;
  const frac = (abs % 1000000n).toString().padStart(6, "0");
  return `${neg ? "-" : ""}${whole.toString()}.${frac}`;
}

/** Short 0x… address for display without losing the checksum head/tail. */
export function shortAddr(addr) {
  if (typeof addr !== "string" || addr.length < 10) return String(addr ?? "");
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * The finite set of judge-facing states. Each carries a stable `tone` the CSS
 * maps to a colour, and `terminal` (whether the order digest was consumed).
 * `paid` means value actually moved on-chain.
 */
export const STATES = {
  ELIGIBLE: { key: "eligible", label: "Eligible", tone: "pay", paid: true, terminal: true },
  INELIGIBLE: { key: "ineligible", label: "Ineligible (refund)", tone: "zero", paid: false, terminal: true },
  ALREADY_SETTLED: { key: "already_settled", label: "Already settled", tone: "block", paid: false, terminal: true },
  INFRA_UNKNOWN: { key: "infra_unknown", label: "Infrastructure unknown", tone: "retry", paid: false, terminal: false },
  REJECTED: { key: "rejected", label: "Rejected", tone: "block", paid: false, terminal: true },
};

/**
 * Classify one negative-proof vector (or the fleet_outage entry) into a judge
 * state. This is the single source of the "duplicate and infrastructure errors
 * are visibly distinct from legitimate ineligibility" acceptance rule.
 */
export function classifyVector(v) {
  switch (v.label) {
    case "eligible_positive":
      return STATES.ELIGIBLE;
    case "refund_ineligible":
      return STATES.INELIGIBLE;
    case "replay":
      return STATES.ALREADY_SETTLED;
    case "infrastructure_unknown":
    case "fleet_outage":
    case "error_status":
      return STATES.INFRA_UNKNOWN;
    default:
      // wrong_domain_*, untrusted_signer, tampered_*, expired
      return STATES.REJECTED;
  }
}

/** Human sentence for what each attempt tried and why it could not pay. */
export const VECTOR_EXPLAIN = {
  refund_ineligible:
    "The merchant source recorded a refund, so no commission is owed. settle() returns, pays zero, and the order is marked settled. A terminal business outcome.",
  wrong_domain_chain:
    "A genuine result minted for a different chain id. The on-chain domain check rejects it before signature recovery.",
  wrong_domain_contract:
    "A genuine result bound to a different settlement contract. Rejected on the domain check.",
  untrusted_signer:
    "A well-formed result signed by a key that is not a registered TEE machine. Signer recovery fails the active-set check.",
  tampered_amount:
    "An authentic result whose amount was inflated after signing. The signature is bound to every field, so recovery fails.",
  tampered_creator:
    "An authentic result whose payee was swapped after signing. Rejected on the bound creator.",
  expired:
    "A result whose validity window already closed. Rejected on expiry.",
  infrastructure_unknown:
    "The evaluator could not decide (code 2). settle() reverts, pays zero, and does NOT consume the order digest, so it is retryable once infrastructure recovers.",
  eligible_positive:
    "An eligible sale confirmed by the merchant source. settle() pays exactly the configured commission to the bound creator, once.",
  replay:
    "The already-paid eligible order, submitted again. The consumed digest makes settle() revert; it cannot pay twice.",
  error_status:
    "A genuinely TEE-signed result whose ActionResult status is error, not success. The data still decodes to a payable outcome, but the verifier pins status to OK, so it reverts and stays retryable.",
  fleet_outage:
    "The whole TEE fleet is offline (empty active set). settle() reverts, pays zero, and does NOT consume the digest, so it is retryable.",
};

/** Build the campaign summary view-model from the positive proof. */
export function campaignView(pos) {
  const ag = pos.exact_amount_agreement;
  const b = pos.balances;
  return {
    chain: pos.chain,
    verifierMode: pos.deployment.verifierMode,
    settlement: pos.deployment.settlement,
    creator: pos.deployment.creator,
    teeId: pos.deployment.teeId,
    escrowFunded: formatMusd(b.escrowBefore),
    commissionBps: ag.commissionBps,
    commissionPercent: (ag.commissionBps / 100).toString(),
    netApplied: formatMusd(ag.netApplied),
  };
}

/** Build the eligible (positive) scenario view-model from the positive proof. */
export function eligibleView(pos) {
  const ag = pos.exact_amount_agreement;
  const b = pos.balances;
  return {
    state: STATES.ELIGIBLE,
    orderDigest: pos.order.orderDigest,
    settleTx: pos.transactions.settle,
    settleStatus: pos.transactions.settleStatus,
    commission: formatMusd(ag.fccResultAmount),
    creatorBefore: formatMusd(b.creatorBefore),
    creatorAfter: formatMusd(b.creatorAfter),
    creatorDelta: formatMusd(b.creatorDelta),
    escrowBefore: formatMusd(b.escrowBefore),
    escrowAfter: formatMusd(b.escrowAfter),
    allEqual: ag.all_equal === true,
    explain: VECTOR_EXPLAIN.eligible_positive,
    agreement: [
      ["Configured formula floor(net x bps / 10000)", formatMusd(ag.configuredFormula_floor_net_bps_over_10000)],
      ["FCC result amount", formatMusd(ag.fccResultAmount)],
      ["Settled event amount", formatMusd(ag.settledEventAmount)],
      ["Creator balance delta", formatMusd(ag.creatorBalanceDelta)],
      ["Escrow balance delta", formatMusd(ag.escrowBalanceDelta)],
    ],
  };
}

/** Build the negative scenario cards from the negative proof (every attempt). */
export function negativeScenarios(neg) {
  const cards = neg.vectors.map((v) => {
    const state = classifyVector(v);
    return {
      idx: v.idx,
      label: v.label,
      state,
      paid: v.paid === true && Number(v.creatorDelta) > 0,
      creatorDelta: formatMusd(v.creatorDelta),
      revertedWith: v.expectedError === "none" ? null : v.expectedError,
      explain: VECTOR_EXPLAIN[v.label] ?? "",
    };
  });
  // fleet outage is recorded separately, not in the vectors array
  const fo = neg.fleet_outage;
  cards.push({
    idx: cards.length,
    label: "fleet_outage",
    state: classifyVector({ label: "fleet_outage" }),
    paid: false,
    creatorDelta: formatMusd(fo.creatorDelta),
    revertedWith: fo.expectedError,
    explain: VECTOR_EXPLAIN.fleet_outage,
  });
  return cards;
}

/** The one-line winning invariant, read back from the negative proof. */
export function invariantView(neg) {
  const inv = neg.invariant;
  return {
    pathsAttempted: inv.paths_attempted,
    pathsThatPaid: inv.paths_that_transferred_value,
    creatorFinal: formatMusd(inv.creator_final),
    escrowFinal: formatMusd(inv.escrow_final),
    totalSettled: formatMusd(inv.total_settled),
    onlyEligiblePaid: inv.only_eligible_path_paid === true,
    refundTerminal: neg.distinguishability.refund_is_terminal_settled === true,
    infraRetryable: neg.distinguishability.infra_unknown_is_retryable_not_settled === true,
  };
}

/** Everything the page needs, assembled from both proofs. Throws if a proof failed. */
export function buildPage(pos, neg) {
  if (pos.result !== "PASS") throw new Error(`positive proof not PASS: ${pos.result}`);
  if (neg.result !== "PASS") throw new Error(`negative proof not PASS: ${neg.result}`);
  return {
    campaign: campaignView(pos),
    eligible: eligibleView(pos),
    negatives: negativeScenarios(neg),
    invariant: invariantView(neg),
  };
}
