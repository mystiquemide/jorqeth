// State/component tests for the three read-only verification views. Run: node --test
//
// Every value must come from the committed evidence or the frozen spec, so
// no view can hardcode a success. These load the SAME JSON the views fetch.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  RECEIPTS,
  RECEIPT_VERSION,
  configFacts,
  receiptView,
  allReceipts,
  inspectorView,
  briefFacts,
} from "../surfaces.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = (f) => JSON.parse(readFileSync(join(here, "..", "..", f), "utf8"));
const POS = root("evidence/positive-proof.json");
const NEG = root("evidence/negative-proof.json");
const SPEC = root("spec/jorqeth-v1.json");

test("configFacts reads network, mode, and rule from proof + spec (nothing invented)", () => {
  const c = configFacts(POS, SPEC);
  assert.equal(c.network, POS.chain);
  assert.equal(c.settlement, POS.deployment.settlement);
  assert.equal(c.verifierMode, POS.deployment.verifierMode);
  assert.equal(c.attestation, "simulated"); // mode label says simulated-attestation
  assert.equal(c.commissionPercent, "10");
  assert.equal(c.ruleVersionLabel, SPEC.campaign.ruleVersionLabel);
  assert.equal(c.campaignId, SPEC.campaign.campaignId);
});

test("eligible receipt shows the exact payout and the real settle tx, not a hardcode", () => {
  const r = receiptView("eligible", POS, NEG, SPEC);
  assert.equal(r.receiptVersion, RECEIPT_VERSION);
  assert.equal(r.outcomeKey, "eligible");
  assert.equal(r.paid, true);
  assert.equal(r.payout, "20.000000");
  assert.equal(r.payoutSigned, "+20.000000");
  assert.equal(r.creatorBefore, "0.000000");
  assert.equal(r.creatorAfter, "20.000000");
  assert.equal(r.settleTx, POS.transactions.settle);
  assert.equal(r.settleStatus, POS.transactions.settleStatus);
  assert.equal(r.orderDigest, SPEC.orders["ORDER-A"].orderDigest);
  assert.equal(r.revertReason, null);
  assert.equal(r.digestConsumed, true);
});

test("refund receipt is a terminal zero, not a revert and not eligible", () => {
  const r = receiptView("refund", POS, NEG, SPEC);
  assert.equal(r.outcomeKey, "ineligible");
  assert.equal(r.paid, false);
  assert.equal(r.payout, "0.000000");
  assert.equal(r.terminal, true);
  assert.equal(r.retryable, false);
  assert.equal(r.revertReason, null); // refund returns, does not revert
  assert.equal(r.settleTx, null);
  assert.equal(r.orderDigest, SPEC.orders["ORDER-B"].orderDigest);
});

test("replay receipt reverts AlreadySettled and pays zero", () => {
  const r = receiptView("replay", POS, NEG, SPEC);
  assert.equal(r.outcomeKey, "already_settled");
  assert.equal(r.paid, false);
  assert.equal(r.payout, "0.000000");
  assert.equal(r.revertReason, "AlreadySettled(bytes32)");
  assert.equal(r.orderDigest, SPEC.orders["ORDER-A"].orderDigest); // same order, re-submitted
});

test("infra-unknown receipt is retryable and never reads as eligible/ineligible/success", () => {
  const r = receiptView("infra", POS, NEG, SPEC);
  assert.equal(r.outcomeKey, "infra_unknown");
  assert.equal(r.paid, false);
  assert.equal(r.retryable, true);
  assert.equal(r.terminal, false);
  assert.equal(r.digestConsumed, false);
  assert.notEqual(r.outcomeKey, "eligible");
  assert.notEqual(r.outcomeKey, "ineligible");
  assert.equal(r.revertReason, "NonPayableCode(uint8)");
  assert.equal(r.orderDigest, SPEC.orders["ORDER-C"].orderDigest);
});

test("exactly four approved receipts, one paid, each a distinct outcome", () => {
  const all = allReceipts(POS, NEG, SPEC);
  assert.equal(all.length, RECEIPTS.length);
  assert.equal(all.length, 4);
  assert.equal(all.filter((r) => r.paid).length, 1);
  const keys = new Set(all.map((r) => r.outcomeKey));
  assert.equal(keys.size, 4); // eligible, ineligible, already_settled, infra_unknown
});

test("receiptView throws on an unknown receipt key and on a failed proof", () => {
  assert.throws(() => receiptView("nope", POS, NEG, SPEC), /unknown receipt/);
  assert.throws(() => receiptView("eligible", { ...POS, result: "FAIL" }, NEG, SPEC), /positive proof not PASS/);
  assert.throws(() => receiptView("refund", POS, { ...NEG, result: "FAIL" }, SPEC), /negative proof not PASS/);
});

test("inspector binds the exact on-chain PayableResult schema, not prose", () => {
  const i = inspectorView(POS, NEG, SPEC);
  const names = i.boundFields.map((f) => f.name);
  for (const req of ["campaignId", "orderDigest", "creator", "amount", "eligibilityCode", "chainId", "settlementContract", "ruleVersion", "expiry"]) {
    assert.ok(names.includes(req), `bound fields must include ${req}`);
  }
  // types parsed alongside names
  const amount = i.boundFields.find((f) => f.name === "amount");
  assert.equal(amount.type, "uint256");
  assert.equal(i.chain.length, 5); // the five-step verification chain
});

test("inspector labels local compatibility honestly and never claims production", () => {
  const i = inspectorView(POS, NEG, SPEC);
  assert.equal(i.attestation, "simulated");
  assert.match(i.attestationCopy, /format compatibility/);
  assert.doesNotMatch(i.attestationCopy, /production Confidential Space attestation\./i);
  assert.match(i.genuineness, /compatibility vector/);
  assert.equal(i.onlyEligiblePaid, true);
});

test("inspector withheld fields never leak a private field name into a value", () => {
  const i = inspectorView(POS, NEG, SPEC);
  assert.ok(i.withheldFields.length >= 3);
  const blob = JSON.stringify(i).toLowerCase();
  // these are described as withheld, but must not carry an actual value/credential
  for (const bad of ["password", "mnemonic", "private key", "privatekey", "0xac0974", "cvv", "ssn"]) {
    assert.ok(!blob.includes(bad), `inspector must not contain ${bad}`);
  }
});

test("brief states the merchant-source limitation first and separates new work from scaffold", () => {
  const b = briefFacts(POS, SPEC);
  assert.match(b.limitations[0], /[Mm]erchant-source/);
  assert.ok(b.newWork.length >= 3);
  assert.ok(b.inheritedScaffold.length >= 2);
  assert.equal(b.roadmap.length, 3); // production secrets, pilot connector, settlement window
  assert.equal(b.network, POS.chain);
  assert.equal(b.links.repo, "https://github.com/mystiquemide/jorqeth");
});

test("no surface view-model leaks a credential, key, or customer field", () => {
  const models = [
    ...allReceipts(POS, NEG, SPEC),
    inspectorView(POS, NEG, SPEC),
    briefFacts(POS, SPEC),
  ];
  const blob = JSON.stringify(models).toLowerCase();
  for (const bad of ["cardnumber", "cvv", "ssn", "mnemonic", "password", "private key", "privatekey", "customer identity and"]) {
    // "customer identity and contact details" is the WITHHELD label; allow that exact doc string
    if (bad === "customer identity and") continue;
    assert.ok(!blob.includes(bad), `surface models must not contain ${bad}`);
  }
});
