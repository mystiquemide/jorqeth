#!/usr/bin/env bash
#
# Milestone 4 negative and failure proofs: deploy the same funded campaign as the
# positive proof, then deliberately attempt to violate the winning invariant from
# every angle and prove enforcement as REAL on-chain state.
#
# Pipeline:
#   1. boot a fresh anvil (chainId 31337)
#   2. broadcast script/NegativeProof.s.sol: deploy stack + fund escrow, then run the
#      whole negative matrix through NegativeProbe.runAll (one tx, try/catch per attempt)
#      plus a forced TEE-fleet-outage attempt, and console-log every outcome
#   3. read the resulting on-chain state back over RPC with `cast` (independent of the
#      script's own simulation)
#   4. gate: exactly one path (the approved eligible order) moved value, and it moved
#      exactly the commission; every other path paid zero, and each reverting path
#      reverted for the expected reason
#   5. write evidence/negative-proof.json (machine) and evidence/negative-proof.md (human)
#
# Reproducible with only Foundry (forge/anvil/cast) + jq. No secrets: the key below is
# the well-known public anvil test key. No live/production system is touched.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

RPC="http://127.0.0.1:8545"
DEPLOYER_PK="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
ORDER_A="0xbe4b0fa03136646a52108527f8dd4873c60796d246fe5dd610ec0d4a2f6a1a45"
ORDER_B="0x2211acb1c6f286f7f78d0540520ff45e6b53701156d05e1951bb85bbfefff065"
ORDER_C="0x5739f03e7db113339cc4be123cbb055d3dcb549923fd291f390ef6e9bfd7b9c3"
ORDER_E="0xa50c050e20eaf35d43a38130274dd209c67055cc7918d0f537af12b9731c7a9e"
ORDER_F="0xe6cd69d332b9696ce3fd14f3beeb1ddc4f1cb9d0b1d63a0b3e793e3ed1293af1"
COMMISSION_A=20000000
ESCROW_AMOUNT=100000000

EVID_DIR="$REPO_ROOT/evidence"
mkdir -p "$EVID_DIR"
FORGE_LOG="$EVID_DIR/negative-proof.forge.log"

ANVIL_PID=""
cleanup() { [ -n "$ANVIL_PID" ] && kill "$ANVIL_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "==> booting anvil (chainId 31337)"
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --silent &
ANVIL_PID=$!
for _ in $(seq 1 50); do
  if cast block-number --rpc-url "$RPC" >/dev/null 2>&1; then break; fi
  sleep 0.2
done
cast block-number --rpc-url "$RPC" >/dev/null

echo "==> broadcasting script/NegativeProof.s.sol"
forge script script/NegativeProof.s.sol:NegativeProof \
  --rpc-url "$RPC" --broadcast --private-key "$DEPLOYER_PK" -vv \
  2>&1 | tee "$FORGE_LOG"

# --- parse the console evidence block (tolerant to ':' or ' ' delimiters) ---
PARSED="$(mktemp)"
awk '
  /JORQETH_EVIDENCE_BEGIN/{f=1;next}
  /JORQETH_EVIDENCE_END/{f=0}
  f{ key=$1; sub(/:$/,"",key); $1=""; val=$0; sub(/^[ \t:]+/,"",val); if(key!="") print key"="val }
' "$FORGE_LOG" > "$PARSED"
get() { sed -n "s/^$1=//p" "$PARSED" | head -1; }
num() { echo "$1" | awk '{print $1}'; }

SETTLEMENT="$(get settlement)"
TOKEN="$(get token)"
REGISTRY="$(get registry)"
VERIFIER="$(get verifier)"
CREATOR="$(get creator)"
TEE_ID="$(get teeId)"
EXTENSION_ID="$(get extensionId)"
VERIFIER_MODE="$(get verifierMode)"
[ -n "$SETTLEMENT" ] || { echo "FAIL: could not parse settlement address"; exit 1; }
echo "==> settlement deployed at $SETTLEMENT"

# --- independent on-chain readback (NOT the script's own simulation) ---
ESCROW_ONCHAIN="$(num "$(cast call "$SETTLEMENT" 'escrowBalance()(uint256)' --rpc-url "$RPC")")"
TOTAL_ONCHAIN="$(num "$(cast call "$SETTLEMENT" 'totalSettled()(uint256)' --rpc-url "$RPC")")"
CREATOR_ONCHAIN="$(num "$(cast call "$TOKEN" 'balanceOf(address)(uint256)' "$CREATOR" --rpc-url "$RPC")")"
SETTLED_A="$(cast call "$SETTLEMENT" 'isSettled(bytes32)(bool)' "$ORDER_A" --rpc-url "$RPC")"
SETTLED_B="$(cast call "$SETTLEMENT" 'isSettled(bytes32)(bool)' "$ORDER_B" --rpc-url "$RPC")"
SETTLED_C="$(cast call "$SETTLEMENT" 'isSettled(bytes32)(bool)' "$ORDER_C" --rpc-url "$RPC")"
SETTLED_E="$(cast call "$SETTLEMENT" 'isSettled(bytes32)(bool)' "$ORDER_E" --rpc-url "$RPC")"
SETTLED_F="$(cast call "$SETTLEMENT" 'isSettled(bytes32)(bool)' "$ORDER_F" --rpc-url "$RPC")"
echo "==> on-chain: escrow=$ESCROW_ONCHAIN totalSettled=$TOTAL_ONCHAIN creator=$CREATOR_ONCHAIN settledA=$SETTLED_A settledB=$SETTLED_B settledC=$SETTLED_C settledE=$SETTLED_E settledF=$SETTLED_F"

# --- expected per-vector outcome (label ; expected revert selector ; expect paid) ---
LABELS=(refund_ineligible wrong_domain_chain wrong_domain_contract untrusted_signer \
        tampered_amount tampered_creator expired infrastructure_unknown eligible_positive replay \
        error_status)
EXPECT_SIG=("" "WrongChain(uint256,uint256)" "WrongContract(address,address)" "BadResult()" \
        "BadResult()" "WrongCreator(address,address)" "Expired(uint64,uint256)" \
        "NonPayableCode(uint8)" "" "AlreadySettled(bytes32)" "BadResult()")
EXPECT_PAID=(true false false false false false false false true false false)

ok=true
fail() { echo "MISMATCH: $1"; ok=false; }

# --- per-vector gate ---
VEC_JSON="$(mktemp)"
: > "$VEC_JSON"
PAYING_PATHS=0
for i in $(seq 0 10); do
  P="$(get "v${i}_paid")"; S="$(get "v${i}_sel")"; CD="$(num "$(get "v${i}_creatorDelta")")"; ED="$(num "$(get "v${i}_escrowDelta")")"
  EXP_PAID="${EXPECT_PAID[$i]}"; EXP_SIG="${EXPECT_SIG[$i]}"; LABEL="${LABELS[$i]}"
  EXP_SEL="0x00000000"; [ -n "$EXP_SIG" ] && EXP_SEL="$(cast sig "$EXP_SIG")"

  [ "$P" = "$EXP_PAID" ] || fail "v${i} ($LABEL) paid=$P expected $EXP_PAID"
  if [ "$EXP_PAID" = "false" ]; then
    [ "$S" = "$EXP_SEL" ] || fail "v${i} ($LABEL) selector $S expected $EXP_SEL ($EXP_SIG)"
    [ "$CD" = "0" ] || fail "v${i} ($LABEL) creatorDelta=$CD expected 0"
    [ "$ED" = "0" ] || fail "v${i} ($LABEL) escrowDelta=$ED expected 0"
  fi
  [ "$CD" != "0" ] && PAYING_PATHS=$((PAYING_PATHS + 1))
  jq -nc --argjson idx "$i" --arg label "$LABEL" --arg paid "$P" --arg sel "$S" \
     --arg expectSel "$EXP_SEL" --arg expectSig "${EXP_SIG:-none}" \
     --argjson creatorDelta "$CD" --argjson escrowDelta "$ED" \
     '{idx:$idx,label:$label,paid:($paid=="true"),revertSelector:$sel,expectedSelector:$expectSel,expectedError:$expectSig,creatorDelta:$creatorDelta,escrowDelta:$escrowDelta}' \
     >> "$VEC_JSON"
done

# vector 8 is the single approved payout
V8_CD="$(num "$(get v8_creatorDelta)")"
[ "$V8_CD" = "$COMMISSION_A" ] || fail "eligible_positive creatorDelta=$V8_CD expected $COMMISSION_A"

# --- forced TEE-fleet outage (infrastructure unknown, empty active set) ---
T_PAID="$(get timeout_paid)"; T_SEL="$(get timeout_sel)"; T_CD="$(num "$(get timeout_creatorDelta)")"
EMPTY_REG_SEL="$(cast sig 'EmptyRegistry()')"
[ "$T_PAID" = "false" ] || fail "fleet-outage paid=$T_PAID expected false"
[ "$T_SEL" = "$EMPTY_REG_SEL" ] || fail "fleet-outage selector $T_SEL expected $EMPTY_REG_SEL (EmptyRegistry)"
[ "$T_CD" = "0" ] || fail "fleet-outage creatorDelta=$T_CD expected 0"

# --- global invariant gate (read back independently over RPC) ---
[ "$PAYING_PATHS" = "1" ] || fail "paying paths = $PAYING_PATHS expected exactly 1"
[ "$CREATOR_ONCHAIN" = "$COMMISSION_A" ] || fail "creator on-chain=$CREATOR_ONCHAIN expected $COMMISSION_A"
[ "$ESCROW_ONCHAIN" = "$((ESCROW_AMOUNT - COMMISSION_A))" ] || fail "escrow on-chain=$ESCROW_ONCHAIN expected $((ESCROW_AMOUNT - COMMISSION_A))"
[ "$TOTAL_ONCHAIN" = "$COMMISSION_A" ] || fail "totalSettled on-chain=$TOTAL_ONCHAIN expected $COMMISSION_A"
# distinguishability: refund is terminal (settled), infra-unknown is retryable (not settled)
[ "$SETTLED_A" = "true" ] || fail "ORDER_A not settled"
[ "$SETTLED_B" = "true" ] || fail "ORDER_B (refund) not terminal"
[ "$SETTLED_C" = "false" ] || fail "ORDER_C (infra-unknown) wrongly consumed"
[ "$SETTLED_E" = "false" ] || fail "ORDER_E (fleet-outage) wrongly consumed (must stay retryable)"
[ "$SETTLED_F" = "false" ] || fail "ORDER_F (error-status) wrongly consumed (must stay retryable)"

$ok || { echo "NEGATIVE PROOF FAILED"; rm -f "$PARSED" "$VEC_JSON"; exit 1; }

# --- write the committed evidence bundle ---
VECTORS="$(jq -s '.' "$VEC_JSON")"
jq -n \
  --arg generated_by "evidence/run-negative-proof.sh" \
  --arg chain "local anvil devnet (chainId 31337)" \
  --arg note "The mirror of the positive proof: same funded campaign, same real FCC verifier, every failure mode attempted against live state. Runs on local anvil 31337 for the same reason as the positive proof (BLK-001/BLK-002). Each attempt runs through NegativeProbe.runAll (try/catch per attempt) so one transaction records the whole matrix; the persisted on-chain balances then confirm, independently over RPC, that only the single eligible payout transferred value." \
  --arg settlement "$SETTLEMENT" --arg token "$TOKEN" --arg registry "$REGISTRY" \
  --arg verifier "$VERIFIER" --arg verifierMode "$VERIFIER_MODE" \
  --arg creator "$CREATOR" --arg teeId "$TEE_ID" --arg extensionId "$EXTENSION_ID" \
  --argjson escrowFinal "$ESCROW_ONCHAIN" --argjson creatorFinal "$CREATOR_ONCHAIN" \
  --argjson totalSettled "$TOTAL_ONCHAIN" --argjson payingPaths "$PAYING_PATHS" \
  --arg settledA "$SETTLED_A" --arg settledB "$SETTLED_B" --arg settledC "$SETTLED_C" --arg settledE "$SETTLED_E" --arg settledF "$SETTLED_F" \
  --arg timeoutPaid "$T_PAID" --arg timeoutSel "$T_SEL" --argjson timeoutCreatorDelta "$T_CD" \
  --argjson vectors "$VECTORS" \
  '{
    proof: "milestone-4-negative",
    result: "PASS",
    generated_by: $generated_by,
    chain: $chain,
    provenance_note: $note,
    deployment: {
      settlement: $settlement, escrowToken: $token, teeRegistry: $registry,
      fccVerifier: $verifier, verifierMode: $verifierMode,
      creator: $creator, teeId: $teeId, extensionId: $extensionId
    },
    invariant: {
      paths_attempted: (($vectors | length) + 1),
      paths_that_transferred_value: $payingPaths,
      creator_final: $creatorFinal,
      escrow_final: $escrowFinal,
      total_settled: $totalSettled,
      only_eligible_path_paid: ($payingPaths == 1 and $creatorFinal == 20000000)
    },
    distinguishability: {
      refund_is_terminal_settled: ($settledB == "true"),
      infra_unknown_is_retryable_not_settled: ($settledC == "false"),
      fleet_outage_is_retryable_not_settled: ($settledE == "false"),
      error_status_is_retryable_not_settled: ($settledF == "false"),
      eligible_consumed: ($settledA == "true")
    },
    fleet_outage: {
      paid: ($timeoutPaid == "true"), revertSelector: $timeoutSel,
      expectedError: "EmptyRegistry()", creatorDelta: $timeoutCreatorDelta
    },
    vectors: $vectors
  }' > "$EVID_DIR/negative-proof.json"

rm -f "$VEC_JSON"
echo "==> wrote evidence/negative-proof.json"

# --- human-readable evidence (evidence/negative-proof.md) ---
{
  echo "# Milestone 4 — Negative and Failure Proofs"
  echo
  echo "**Result: PASS.** Against one funded campaign, eleven hostile or failure paths were"
  echo "attempted plus a forced TEE-fleet outage. Exactly one path, the single approved"
  echo "eligible order, moved value, and it moved exactly the commission. Every other path"
  echo "paid nothing, and each reverting path reverted for the expected reason."
  echo
  echo "- **Chain:** local anvil devnet (chainId 31337), same rationale as the positive proof (BLK-001/BLK-002)"
  echo "- **Verifier mode:** \`$VERIFIER_MODE\` (honestly labelled; not production hardware)"
  echo "- **Regenerate:** \`bash evidence/run-negative-proof.sh\` (Foundry + jq; no secrets, no live systems)"
  echo
  echo "## Outcome per attempt"
  echo
  echo "| # | Attempt | settle() | Value moved | Reverted with |"
  echo "| --- | --- | --- | --- | --- |"
  for i in $(seq 0 10); do
    P="$(get "v${i}_paid")"; CD="$(num "$(get "v${i}_creatorDelta")")"
    LABEL="${LABELS[$i]}"; SIG="${EXPECT_SIG[$i]:-}"
    if [ "$P" = "true" ] && [ "$CD" != "0" ]; then STATE="returned"; REV="-"; MOVED="$CD"; \
    elif [ "$P" = "true" ]; then STATE="returned"; REV="- (settled zero)"; MOVED="0"; \
    else STATE="reverted"; REV="\`$SIG\`"; MOVED="0"; fi
    echo "| $i | $LABEL | $STATE | $MOVED | $REV |"
  done
  echo "| 11 | fleet_outage (empty TEE set) | reverted | 0 | \`EmptyRegistry()\` |"
  echo
  echo "## Winning invariant (read back over RPC)"
  echo
  echo "- Paths that transferred value: **$PAYING_PATHS** (only \`eligible_positive\`)."
  echo "- Creator final balance: **$CREATOR_ONCHAIN** (= exact commission)."
  echo "- Escrow final: **$ESCROW_ONCHAIN** (funded $ESCROW_AMOUNT − commission $COMMISSION_A)."
  echo "- \`totalSettled\`: **$TOTAL_ONCHAIN**."
  echo
  echo "## Legitimate ineligibility vs infrastructure unknown"
  echo
  echo "- Refund (\`refund_ineligible\`, ORDER_B): \`settle()\` **returns**, pays zero, and the"
  echo "  digest is **consumed** (\`isSettled\` = $SETTLED_B). A terminal business outcome."
  echo "- Infrastructure unknown (\`infrastructure_unknown\`, ORDER_C, code 2): \`settle()\`"
  echo "  **reverts**, pays zero, and the digest is **not consumed** (\`isSettled\` = $SETTLED_C)."
  echo "- Fleet outage (\`fleet_outage\`, ORDER_E, empty TEE set): \`settle()\` **reverts**, pays"
  echo "  zero, and the digest is **not consumed** (\`isSettled\` = $SETTLED_E), retryable"
  echo "  once infra recovers."
  echo "- Error status (\`error_status\`, ORDER_F): a genuinely TEE-signed result whose"
  echo "  ActionResult status is error (tee-node status 0), not success. The signature is"
  echo "  authentic and the Data decodes to a payable eligible outcome, but the verifier"
  echo "  pins status to OK, so \`settle()\` **reverts** (\`BadResult()\`), pays zero, and the"
  echo "  digest is **not consumed** (\`isSettled\` = $SETTLED_F), retryable like a timeout."
  echo
  echo "That difference, settled-zero versus reverted-and-retryable, is how a genuine"
  echo "\"no commission owed\" is told apart from \"we could not decide\"."
  echo
  echo "Machine-readable form: \`evidence/negative-proof.json\`. Regenerate the raw script log"
  echo "locally with \`bash evidence/run-negative-proof.sh\` (written to \`evidence/negative-proof.forge.log\`)."
} > "$EVID_DIR/negative-proof.md"

rm -f "$PARSED"
echo "==> wrote evidence/negative-proof.md"
echo "NEGATIVE PROOF PASSED"
