// State/component tests for the verification-replay view-model. Run: node --test
//
// These prove every visible state renders from real committed evidence, so
// the page cannot show a hardcoded success label. They load the SAME committed
// JSON the page fetches at runtime.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  formatMusd,
  shortAddr,
  classifyVector,
  STATES,
  campaignView,
  eligibleView,
  negativeScenarios,
  invariantView,
  buildPage,
} from "../view.js";

const here = dirname(fileURLToPath(import.meta.url));
const evid = (f) => JSON.parse(readFileSync(join(here, "..", "..", "evidence", f), "utf8"));
const POS = evid("positive-proof.json");
const NEG = evid("negative-proof.json");

test("formatMusd renders 6-decimal base units", () => {
  assert.equal(formatMusd(20000000), "20.000000");
  assert.equal(formatMusd(0), "0.000000");
  assert.equal(formatMusd(100000000), "100.000000");
  assert.equal(formatMusd(1), "0.000001");
});

test("shortAddr keeps head and tail", () => {
  assert.equal(shortAddr("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"), "0x7099…79C8");
});

test("classifyVector separates the distinct settlement states", () => {
  assert.equal(classifyVector({ label: "eligible_positive" }), STATES.ELIGIBLE);
  assert.equal(classifyVector({ label: "refund_ineligible" }), STATES.INELIGIBLE);
  assert.equal(classifyVector({ label: "replay" }), STATES.ALREADY_SETTLED);
  assert.equal(classifyVector({ label: "infrastructure_unknown" }), STATES.INFRA_UNKNOWN);
  assert.equal(classifyVector({ label: "fleet_outage" }), STATES.INFRA_UNKNOWN);
  assert.equal(classifyVector({ label: "error_status" }), STATES.INFRA_UNKNOWN);
  assert.equal(classifyVector({ label: "untrusted_signer" }), STATES.REJECTED);
});

test("duplicate and infra states are visibly distinct from legitimate ineligibility", () => {
  // acceptance criterion: duplicate + infra errors must not read as a refund
  assert.notEqual(STATES.ALREADY_SETTLED.tone, STATES.INELIGIBLE.tone);
  assert.notEqual(STATES.INFRA_UNKNOWN.tone, STATES.INELIGIBLE.tone);
  // ineligibility is terminal; infra-unknown is retryable
  assert.equal(STATES.INELIGIBLE.terminal, true);
  assert.equal(STATES.INFRA_UNKNOWN.terminal, false);
});

test("campaignView binds to the funded campaign", () => {
  const c = campaignView(POS);
  assert.equal(c.escrowFunded, "100.000000");
  assert.equal(c.commissionPercent, "10");
  assert.equal(c.verifierMode, "fcc-action-result-v1/simulated-attestation");
  assert.equal(c.creator, POS.deployment.creator);
});

test("eligibleView shows the exact commission and matching creator delta", () => {
  const e = eligibleView(POS);
  assert.equal(e.state, STATES.ELIGIBLE);
  assert.equal(e.commission, "20.000000");
  assert.equal(e.creatorBefore, "0.000000");
  assert.equal(e.creatorAfter, "20.000000");
  assert.equal(e.creatorDelta, "20.000000");
  assert.equal(e.allEqual, true);
  // every independent amount source agrees
  for (const [, amt] of e.agreement) assert.equal(amt, "20.000000");
});

test("negative scenarios: exactly one card paid, and it is the eligible order", () => {
  const cards = negativeScenarios(NEG);
  const paid = cards.filter((c) => c.paid);
  assert.equal(paid.length, 1);
  assert.equal(paid[0].label, "eligible_positive");
  assert.equal(paid[0].creatorDelta, "20.000000");
});

test("negative scenarios: refund pays zero and reads as ineligible, not rejected", () => {
  const cards = negativeScenarios(NEG);
  const refund = cards.find((c) => c.label === "refund_ineligible");
  assert.equal(refund.paid, false);
  assert.equal(refund.creatorDelta, "0.000000");
  assert.equal(refund.state, STATES.INELIGIBLE);
  assert.equal(refund.revertedWith, null); // it returns, does not revert
});

test("negative scenarios: replay is a distinct blocked state that reverts AlreadySettled", () => {
  const cards = negativeScenarios(NEG);
  const replay = cards.find((c) => c.label === "replay");
  assert.equal(replay.state, STATES.ALREADY_SETTLED);
  assert.equal(replay.paid, false);
  assert.equal(replay.revertedWith, "AlreadySettled(bytes32)");
});

test("negative scenarios: infra-unknown, error-status, and fleet-outage all read retryable", () => {
  const cards = negativeScenarios(NEG);
  for (const label of ["infrastructure_unknown", "error_status", "fleet_outage"]) {
    const c = cards.find((x) => x.label === label);
    assert.equal(c.state, STATES.INFRA_UNKNOWN, `${label} state`);
    assert.equal(c.paid, false, `${label} paid`);
    assert.equal(c.state.terminal, false, `${label} terminal`);
  }
});

test("fleet_outage card exists and is sourced from the separate evidence field", () => {
  const cards = negativeScenarios(NEG);
  const fo = cards.find((c) => c.label === "fleet_outage");
  assert.ok(fo);
  assert.equal(fo.revertedWith, "EmptyRegistry()");
});

test("invariantView reports the settlement invariant one-liner from real state", () => {
  const inv = invariantView(NEG);
  assert.equal(inv.pathsThatPaid, 1);
  assert.equal(inv.creatorFinal, "20.000000");
  assert.equal(inv.escrowFinal, "80.000000");
  assert.equal(inv.onlyEligiblePaid, true);
  assert.equal(inv.refundTerminal, true);
  assert.equal(inv.infraRetryable, true);
});

test("buildPage throws if either proof did not PASS", () => {
  assert.throws(() => buildPage({ ...POS, result: "FAIL" }, NEG), /positive proof not PASS/);
  assert.throws(() => buildPage(POS, { ...NEG, result: "FAIL" }), /negative proof not PASS/);
});

test("buildPage assembles the whole page from both proofs", () => {
  const page = buildPage(POS, NEG);
  assert.equal(page.eligible.commission, "20.000000");
  assert.equal(page.invariant.pathsThatPaid, 1);
  assert.equal(page.negatives.length, NEG.vectors.length + 1); // + fleet outage
});

test("no raw record, credential, or private key leaks through the view-model", () => {
  const page = buildPage(POS, NEG);
  const blob = JSON.stringify(page).toLowerCase();
  for (const bad of ["cardnumber", "cvv", "ssn", "mnemonic", "password", "private key", "privatekey", "customer"]) {
    assert.ok(!blob.includes(bad), `view-model must not contain ${bad}`);
  }
});
