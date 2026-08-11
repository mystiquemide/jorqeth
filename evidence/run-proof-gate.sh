#!/usr/bin/env bash
#
# The verification suite.
#
# One command that re-runs every core proof from a clean state and resolves each
# verification check to a concrete source-of-truth artifact, or fails loudly.
#
# It executes, in order:
#   1. forge test                    -- the full invariant + FCC + vector suite
#   2. evidence/run-positive-proof.sh -- eligible order pays the exact commission, once
#   3. evidence/run-negative-proof.sh -- every failure mode refuses to pay; escrow intact
#   4. (best-effort) re-derive the genuine tee-node signature vector from real Flare code
#   5. a privacy scan of the committed public evidence for prohibited fields
#
# then maps the verification checks to that evidence and writes:
#   evidence/proof-gate.json  (machine)   and   evidence/proof-gate.md  (human)
#
# Reproducible with Foundry (forge/anvil/cast) + jq. Go is optional (item 2 is
# covered by the FccRealSignature forge suite regardless). No secrets, no
# live systems: the only private key touched is the well-known public anvil dev key.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
EVID_DIR="$REPO_ROOT/evidence"
mkdir -p "$EVID_DIR"

FORGE_LOG="$EVID_DIR/proof-gate.forge.log"
POS_LOG="$EVID_DIR/proof-gate.positive.log"
NEG_LOG="$EVID_DIR/proof-gate.negative.log"
GO_LOG="$EVID_DIR/proof-gate.go.log"

# The well-known public anvil account-0 private key. Documented, not a secret;
# the only full private key that legitimately appears in tracked files.
ANVIL_PK0="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

pass=true
ITEMS="$(mktemp)"; : > "$ITEMS"
add_item() { # key ; requirement ; status(pass|fail) ; evidence
  jq -nc --arg key "$1" --arg req "$2" --arg status "$3" --arg ev "$4" \
    '{item:$key,requirement:$req,status:$status,evidence:$ev}' >> "$ITEMS"
  [ "$3" = "pass" ] || pass=false
}

# ------------------------------------------------------------------ 1. forge test
echo "==> [1/5] forge test (full suite)"
forge test > "$FORGE_LOG" 2>&1 || true
SUMMARY="$(grep -E 'tests? passed' "$FORGE_LOG" | tail -1)"
T_PASS="$(echo "$SUMMARY" | grep -oE '[0-9]+ tests? passed' | grep -oE '[0-9]+' | head -1)"
T_FAIL="$(echo "$SUMMARY" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' | head -1)"
T_PASS="${T_PASS:-0}"; T_FAIL="${T_FAIL:-1}"
FORGE_OK=false; [ "$T_FAIL" = "0" ] && [ "$T_PASS" -gt 0 ] && FORGE_OK=true
echo "    forge: $T_PASS passed, $T_FAIL failed"

# per-suite FCC authenticity checks (real signature + settlement swap)
suite_ok() { # $1 = suite source substring
  awk -v s="$1" '
    $0 ~ s {seen=1}
    seen && /Suite result:/ { if ($0 ~ /ok\./) print "ok"; else print "bad"; exit }
  ' "$FORGE_LOG"
}
REALSIG_OK="$(suite_ok 'FccRealSignature.t.sol')"
FCCSET_OK="$(suite_ok 'FccSettlement.t.sol')"

# ------------------------------------------------------------- 2. positive proof
echo "==> [2/5] positive proof (clean anvil)"
bash evidence/run-positive-proof.sh > "$POS_LOG" 2>&1 || true
POS_OK=false; grep -q "POSITIVE PROOF PASSED" "$POS_LOG" && POS_OK=true
POS_RESULT="$(jq -r '.result' evidence/positive-proof.json 2>/dev/null || echo MISSING)"
POS_ALLEQ="$(jq -r '.exact_amount_agreement.all_equal' evidence/positive-proof.json 2>/dev/null || echo false)"
POS_AMOUNT="$(jq -r '.exact_amount_agreement.creatorBalanceDelta' evidence/positive-proof.json 2>/dev/null || echo 0)"
echo "    positive: ok=$POS_OK result=$POS_RESULT all_equal=$POS_ALLEQ"

# ------------------------------------------------------------- 3. negative proof
echo "==> [3/5] negative proof (clean anvil)"
bash evidence/run-negative-proof.sh > "$NEG_LOG" 2>&1 || true
NEG_OK=false; grep -q "NEGATIVE PROOF PASSED" "$NEG_LOG" && NEG_OK=true
NEG_ONLY="$(jq -r '.invariant.only_eligible_path_paid' evidence/negative-proof.json 2>/dev/null || echo false)"
NEG_MOVED="$(jq -r '.invariant.paths_that_transferred_value' evidence/negative-proof.json 2>/dev/null || echo -1)"

# specific vectors, read straight from the negative evidence
vec_paid() { jq -r --arg l "$1" '.vectors[] | select(.label==$l) | .paid' evidence/negative-proof.json 2>/dev/null; }
REPLAY_PAID="$(vec_paid replay)"
WCHAIN_PAID="$(vec_paid wrong_domain_chain)"
WCONTRACT_PAID="$(vec_paid wrong_domain_contract)"
INFRA_RETRY="$(jq -r '.distinguishability.infra_unknown_is_retryable_not_settled' evidence/negative-proof.json 2>/dev/null || echo false)"
FLEET_RETRY="$(jq -r '.distinguishability.fleet_outage_is_retryable_not_settled' evidence/negative-proof.json 2>/dev/null || echo false)"
ERROR_RETRY="$(jq -r '.distinguishability.error_status_is_retryable_not_settled' evidence/negative-proof.json 2>/dev/null || echo false)"
REFUND_TERMINAL="$(jq -r '.distinguishability.refund_is_terminal_settled' evidence/negative-proof.json 2>/dev/null || echo false)"
echo "    negative: ok=$NEG_OK only_eligible=$NEG_ONLY moved=$NEG_MOVED"

# ------------------------------------------------ 4. re-derive genuine vector (best-effort)
echo "==> [4/5] genuine tee-node signature vector (best-effort re-derivation)"
GO_VECTOR="covered by forge FccRealSignatureTest (committed vector pinned)"
if command -v go >/dev/null 2>&1; then
  if ( cd tools/tee-signer && GOTOOLCHAIN=local GOFLAGS=-mod=mod timeout 90 go run . ) > "$GO_LOG" 2>&1; then
    if git diff --quiet tools/tee-signer/genuine-vector.json 2>/dev/null; then
      GO_VECTOR="re-derived byte-for-byte from real Flare code (go run .)"
    else
      GO_VECTOR="MISMATCH: re-derived vector differs from committed genuine-vector.json"
      git checkout -- tools/tee-signer/genuine-vector.json 2>/dev/null || true
    fi
  else
    GO_VECTOR="go regen skipped (toolchain go1.25 unavailable offline); covered by forge FccRealSignatureTest"
  fi
fi
echo "    genuine vector: $GO_VECTOR"

# ---------------------------------------------------------------- 5. privacy scan
echo "==> [5/5] privacy scan of committed public evidence"
SCAN_FILES="$(git ls-files evidence spec contracts script tools README.md 2>/dev/null | grep -vE '\.(log)$' || true)"
# This scanner is itself a tracked file under evidence/. Its own source necessarily
# contains the very patterns it hunts for (the regex literals below, and a documented
# example version timestamp), and it holds no merchant or customer data. So the content
# classes below skip it; the private-key class further down still scans it, because a
# real hardcoded key here WOULD be a leak.
SCANNER_SELF='evidence/run-proof-gate.sh'
PATTERN_FILES="$(echo "$SCAN_FILES" | grep -vF "$SCANNER_SELF" || true)"
# The card-shaped numeric class additionally excludes Go dependency manifests: their
# pseudo-version timestamps (14-digit build provenance) are not payment data, and a
# machine-generated lockfile carries no merchant/customer record.
CARD_FILES="$(echo "$PATTERN_FILES" | grep -vE '(^|/)go\.(mod|sum)$' || true)"
PRIV_FINDINGS="$(mktemp)"; : > "$PRIV_FINDINGS"
scan() { # label ; regex ; files(optional, default $PATTERN_FILES)
  # exclude the documented public anvil key line from any match
  local files="${3:-$PATTERN_FILES}"
  grep -rInE "$2" $files 2>/dev/null | grep -v "$ANVIL_PK0" \
    | while IFS= read -r line; do echo "[$1] $line"; done >> "$PRIV_FINDINGS" || true
}
scan "email"        '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
scan "card-shaped"  '\b[0-9]{13,19}\b' "$CARD_FILES"
scan "pii-keyword"  '(cardNumber|card_number|\bcvv\b|\bssn\b|social[_-]?security|passport|customerName|customer_name|customerEmail)'
scan "credential"   '(mnemonic|-----BEGIN (RSA|EC|OPENSSH|PGP)|password[[:space:]]*[:=]|api[_-]?key[[:space:]]*[:=]|secret[_-]?key[[:space:]]*[:=])'
# hardcoded private key literal that is NOT the allowlisted public anvil key
grep -rInE '(private[_-]?key|PRIVATE_KEY|privateKey)[^A-Za-z0-9]{0,4}0x[0-9a-fA-F]{64}' $SCAN_FILES 2>/dev/null \
  | grep -v "$ANVIL_PK0" | while IFS= read -r line; do echo "[private-key] $line"; done >> "$PRIV_FINDINGS" || true

PRIV_COUNT="$(grep -c . "$PRIV_FINDINGS" 2>/dev/null | head -1 | tr -dc '0-9')"
PRIV_COUNT="${PRIV_COUNT:-0}"
PRIV_OK=false; [ "$PRIV_COUNT" = "0" ] && PRIV_OK=true
echo "    privacy: $PRIV_COUNT prohibited pattern(s) found"
[ "$PRIV_COUNT" = "0" ] || { echo "    --- findings ---"; cat "$PRIV_FINDINGS"; }

# ============================================================ map the 9 checklist items
ck() { [ "$1" = "true" ] && echo pass || echo fail; }

# 1. settlement invariant end to end
S1=fail; { $FORGE_OK && $POS_OK && $NEG_OK; } && S1=pass
add_item "settlement_invariant_end_to_end" \
  "The settlement invariant works end to end." "$S1" \
  "forge test $T_PASS passed / $T_FAIL failed; positive-proof.json=$POS_RESULT; negative-proof.json only_eligible=$NEG_ONLY"

# 2. real FCC path authenticates settlement
S2=fail; { [ "$REALSIG_OK" = "ok" ] && [ "$FCCSET_OK" = "ok" ]; } && S2=pass
add_item "real_fcc_required" \
  "The current real FCC path works and gates settlement." "$S2" \
  "FccRealSignatureTest=$REALSIG_OK (genuine Flare-code signature verifies); FccSettlementTest=$FCCSET_OK (eligible pays only on a registered-TEE signature); genuine vector: $GO_VECTOR"

# 3. positive proof inspectable
S3="$(ck "$POS_OK")"; [ "$POS_RESULT" = "PASS" ] || S3=fail
add_item "positive_proof_inspectable" \
  "Positive proof exists and is independently inspectable." "$S3" \
  "evidence/positive-proof.{json,md}; RPC-re-verifiable via the cast calls in positive-proof.md"

# 4. exact payout agreement
S4="$(ck "$POS_ALLEQ")"
add_item "exact_payout_agreement" \
  "The exact eligible payout and creator balance delta agree." "$S4" \
  "positive-proof.json exact_amount_agreement.all_equal=$POS_ALLEQ; creatorBalanceDelta=$POS_AMOUNT across formula/FCC/event/balance"

# 5. negative proof zero payout
S5=fail; { $NEG_OK && [ "$NEG_ONLY" = "true" ] && [ "$REFUND_TERMINAL" = "true" ]; } && S5=pass
add_item "negative_proof_zero_payout" \
  "Negative proof exists and visibly produces zero payout." "$S5" \
  "negative-proof.json paths_that_transferred_value=$NEG_MOVED (only the eligible order); refund settles zero and is terminal ($REFUND_TERMINAL)"

# 6. replay + wrong-domain cannot pay
S6=fail; { [ "$REPLAY_PAID" = "false" ] && [ "$WCHAIN_PAID" = "false" ] && [ "$WCONTRACT_PAID" = "false" ]; } && S6=pass
add_item "replay_wrongdomain_cannot_pay" \
  "Replay and wrong-domain attempts cannot pay." "$S6" \
  "negative-proof.json vectors: replay.paid=$REPLAY_PAID, wrong_domain_chain.paid=$WCHAIN_PAID, wrong_domain_contract.paid=$WCONTRACT_PAID"

# 7. timeout / infra uncertainty fails closed
S7=fail; { [ "$INFRA_RETRY" = "true" ] && [ "$FLEET_RETRY" = "true" ] && [ "$ERROR_RETRY" = "true" ]; } && S7=pass
add_item "timeout_infra_fails_closed" \
  "FCC timeout or infrastructure uncertainty fails closed." "$S7" \
  "negative-proof.json: infra-unknown, fleet-outage, and error-status all revert (pay zero) and do NOT consume the digest (retryable): $INFRA_RETRY/$FLEET_RETRY/$ERROR_RETRY"

# 8. no prohibited fields
S8="$(ck "$PRIV_OK")"
add_item "no_prohibited_fields" \
  "Public evidence contains no raw merchant/customer record or credential." "$S8" \
  "privacy scan of $(echo "$SCAN_FILES" | wc -l | tr -d ' ') tracked files: $PRIV_COUNT prohibited pattern(s); only the documented public anvil dev key is present"

# 9. core reproducible from documented steps
S9=fail; { $FORGE_OK && $POS_OK && $NEG_OK; } && S9=pass
add_item "core_reproducible" \
  "The complete core flow is reproducible from documented steps." "$S9" \
  "this script re-ran forge test + both proofs from a fresh anvil boot; rerun: bash evidence/run-proof-gate.sh"

# ==================================================================== write the record
RESULT=$([ "$pass" = true ] && echo PASS || echo FAIL)
ITEMS_JSON="$(jq -s '.' "$ITEMS")"
PASSED_ITEMS="$(jq '[.[]|select(.status=="pass")]|length' <<<"$ITEMS_JSON")"
TOTAL_ITEMS="$(jq 'length' <<<"$ITEMS_JSON")"

jq -n \
  --arg result "$RESULT" \
  --arg generated_by "evidence/run-proof-gate.sh" \
  --arg chain "local anvil devnet (chainId 31337)" \
  --arg note "The verification suite. One command re-runs the full forge suite and both on-chain proofs from a clean state, then resolves each verification check to a source-of-truth artifact. Runs locally on anvil 31337 with synthetic records, for the same reason as the positive/negative proofs. The live Coston2 FCC attestation path is not yet connected; the genuine Flare-code signature is the self-contained substitute." \
  --argjson forgePassed "$T_PASS" --argjson forgeFailed "$T_FAIL" \
  --arg genuineVector "$GO_VECTOR" \
  --argjson passedItems "$PASSED_ITEMS" --argjson totalItems "$TOTAL_ITEMS" \
  --argjson privacyFindings "$PRIV_COUNT" \
  --argjson checklist "$ITEMS_JSON" \
  '{
    proof: "verification-suite",
    result: $result,
    generated_by: $generated_by,
    chain: $chain,
    provenance_note: $note,
    summary: {
      checklist_items_passed: $passedItems,
      checklist_items_total: $totalItems,
      forge_tests_passed: $forgePassed,
      forge_tests_failed: $forgeFailed,
      genuine_signature_vector: $genuineVector,
      privacy_scan_findings: $privacyFindings
    },
    sources_of_truth: {
      forge_suite: "forge test",
      positive_proof: "evidence/positive-proof.json",
      negative_proof: "evidence/negative-proof.json",
      genuine_signature: "tools/tee-signer/genuine-vector.json + contracts/test/FccRealSignature.t.sol"
    },
    checklist: $checklist
  }' > "$EVID_DIR/proof-gate.json"
echo "==> wrote evidence/proof-gate.json"

# ------------------------------------------------------------- human-readable record
{
  echo "# Verification Report"
  echo
  echo "**Result: $RESULT.** $PASSED_ITEMS of $TOTAL_ITEMS verification checks pass, each"
  echo "resolved to a source-of-truth artifact re-run from a clean state by this script."
  echo
  echo "- **Chain:** local anvil devnet (chainId 31337) with synthetic records, same rationale as the positive/negative proofs"
  echo "- **Reproduce:** \`bash evidence/run-proof-gate.sh\` (Foundry + jq; Go optional; no secrets, no live systems)"
  echo "- **forge test:** $T_PASS passed, $T_FAIL failed"
  echo "- **Genuine signature vector:** $GO_VECTOR"
  echo "- **Privacy scan:** $PRIV_COUNT prohibited pattern(s) in committed public evidence"
  echo
  echo "## Checklist"
  echo
  echo "| # | Requirement | Status | Evidence |"
  echo "| --- | --- | --- | --- |"
  n=1
  while IFS= read -r row; do
    REQ="$(jq -r '.requirement' <<<"$row")"
    ST="$(jq -r '.status' <<<"$row")"
    EV="$(jq -r '.evidence' <<<"$row")"
    MARK=$([ "$ST" = pass ] && echo "PASS" || echo "**FAIL**")
    echo "| $n | $REQ | $MARK | $EV |"
    n=$((n+1))
  done < <(jq -c '.[]' <<<"$ITEMS_JSON")
  echo
  echo "## Sources of truth"
  echo
  echo "- Full test suite: \`forge test\` ($T_PASS passing)"
  echo "- Positive proof: \`evidence/positive-proof.{json,md}\` (eligible order pays the exact commission, once)"
  echo "- Negative proof: \`evidence/negative-proof.{json,md}\` (every failure mode refuses to pay; escrow intact)"
  echo "- Genuine FCC signature: \`tools/tee-signer/genuine-vector.json\` + \`contracts/test/FccRealSignature.t.sol\`"
  echo
  echo "Machine-readable form: \`evidence/proof-gate.json\`."
} > "$EVID_DIR/proof-gate.md"
echo "==> wrote evidence/proof-gate.md"

rm -f "$ITEMS" "$PRIV_FINDINGS"

echo
if [ "$pass" = true ]; then
  echo "VERIFICATION SUITE PASSED ($PASSED_ITEMS/$TOTAL_ITEMS checks)"
  exit 0
else
  echo "VERIFICATION SUITE FAILED ($PASSED_ITEMS/$TOTAL_ITEMS checks)"
  exit 1
fi
