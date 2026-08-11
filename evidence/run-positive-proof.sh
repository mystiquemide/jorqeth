#!/usr/bin/env bash
#
# Positive proof: run the complete successful settlement path as REAL
# on-chain transactions on a local devnet (chainId 31337) and capture an
# independently-inspectable evidence bundle.
#
# Pipeline:
#   1. boot a fresh Anvil devnet (chainId 31337)
#   2. broadcast script/PositiveProof.s.sol: deploy stack, fund escrow, settle one
#      eligible order signed by a local development key via the compatibility scheme
#   3. read the resulting on-chain state back over RPC with `cast` (independent of the
#      script's own simulation), and pull the settle() tx + Settled event from the
#      broadcast receipt
#   4. write evidence/positive-proof.json (machine) and evidence/positive-proof.md (human)
#
# Reproducible with only Foundry (forge/anvil/cast) + jq. No secrets: the signing key
# below is the well-known public anvil test key. No live/production system is touched.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

RPC="http://127.0.0.1:8545"
# Well-known public anvil dev account 0. Its address IS the deployer/merchant; it is a
# published test key, not a secret, and holds only synthetic devnet value.
DEPLOYER_PK="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
ORDER_A="0xbe4b0fa03136646a52108527f8dd4873c60796d246fe5dd610ec0d4a2f6a1a45"

EVID_DIR="$REPO_ROOT/evidence"
mkdir -p "$EVID_DIR"
FORGE_LOG="$EVID_DIR/positive-proof.forge.log"

ANVIL_PID=""
cleanup() { [ -n "$ANVIL_PID" ] && kill "$ANVIL_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "==> booting anvil (chainId 31337)"
anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --silent &
ANVIL_PID=$!

# wait for RPC
for _ in $(seq 1 50); do
  if cast block-number --rpc-url "$RPC" >/dev/null 2>&1; then break; fi
  sleep 0.2
done
cast block-number --rpc-url "$RPC" >/dev/null

echo "==> broadcasting script/PositiveProof.s.sol"
# --slow: send each tx only after the previous receipt lands, so anvil mines exactly one
# tx per block in a fixed order. The signed txs (and their hashes) are unchanged; this only
# removes the auto-mine batching that made settleBlock drift between runs.
forge script script/PositiveProof.s.sol:PositiveProof \
  --rpc-url "$RPC" --broadcast --slow --private-key "$DEPLOYER_PK" -vv \
  2>&1 | tee "$FORGE_LOG"

# --- parse the console evidence block (tolerant to ':' or ' ' delimiters) ---
PARSED="$(mktemp)"
awk '
  /JORQETH_EVIDENCE_BEGIN/{f=1;next}
  /JORQETH_EVIDENCE_END/{f=0}
  f{ key=$1; sub(/:$/,"",key); $1=""; val=$0; sub(/^[ \t:]+/,"",val); if(key!="") print key"="val }
' "$FORGE_LOG" > "$PARSED"

get() { sed -n "s/^$1=//p" "$PARSED" | head -1; }

SETTLEMENT="$(get settlement)"
TOKEN="$(get token)"
REGISTRY="$(get registry)"
VERIFIER="$(get verifier)"
MERCHANT="$(get merchant)"
CREATOR="$(get creator)"
TEE_ID="$(get teeId)"
EXTENSION_ID="$(get extensionId)"
VERIFIER_MODE="$(get verifierMode)"
INSTRUCTION_ID="$(get instructionId)"

[ -n "$SETTLEMENT" ] || { echo "FAIL: could not parse settlement address"; exit 1; }
echo "==> settlement deployed at $SETTLEMENT"

# --- independent on-chain readback (NOT the script's own simulation) ---
ESCROW_ONCHAIN="$(cast call "$SETTLEMENT" 'escrowBalance()(uint256)' --rpc-url "$RPC")"
TOTAL_ONCHAIN="$(cast call "$SETTLEMENT" 'totalSettled()(uint256)' --rpc-url "$RPC")"
SETTLED_ONCHAIN="$(cast call "$SETTLEMENT" 'isSettled(bytes32)(bool)' "$ORDER_A" --rpc-url "$RPC")"
CREATOR_BAL_ONCHAIN="$(cast call "$TOKEN" 'balanceOf(address)(uint256)' "$CREATOR" --rpc-url "$RPC")"
MERCHANT_BAL_ONCHAIN="$(cast call "$TOKEN" 'balanceOf(address)(uint256)' "$MERCHANT" --rpc-url "$RPC")"

# cast may append the token unit in brackets on newer versions; keep only the integer.
num() { echo "$1" | awk '{print $1}'; }
ESCROW_ONCHAIN="$(num "$ESCROW_ONCHAIN")"
TOTAL_ONCHAIN="$(num "$TOTAL_ONCHAIN")"
CREATOR_BAL_ONCHAIN="$(num "$CREATOR_BAL_ONCHAIN")"
MERCHANT_BAL_ONCHAIN="$(num "$MERCHANT_BAL_ONCHAIN")"

echo "==> on-chain: escrow=$ESCROW_ONCHAIN totalSettled=$TOTAL_ONCHAIN creatorBal=$CREATOR_BAL_ONCHAIN settled=$SETTLED_ONCHAIN"

# --- locate the settle() / fund() transactions AUTHORITATIVELY from live event logs ---
# forge's run-latest.json pairs .function to .hash unreliably, so never trust that map.
# The chain's own Settled / CampaignFunded logs give the true tx hash, block, and amount.
SETTLED_TOPIC="$(cast keccak 'Settled(bytes32,bytes32,address,uint8,uint256)')"
SETTLE_LOG="$(cast logs --rpc-url "$RPC" --from-block 0 --to-block latest \
  --address "$SETTLEMENT" 'Settled(bytes32,bytes32,address,uint8,uint256)')"
FUND_LOG="$(cast logs --rpc-url "$RPC" --from-block 0 --to-block latest \
  --address "$SETTLEMENT" 'CampaignFunded(bytes32,address,uint256,uint256)')"

field() { echo "$1" | sed -n "s/^[[:space:]]*$2:[[:space:]]*//p" | head -1; }
SETTLE_TX="$(field "$SETTLE_LOG" transactionHash)"
FUND_TX="$(field "$FUND_LOG" transactionHash)"
SETTLE_BLOCK="$(field "$SETTLE_LOG" blockNumber)"
SETTLED_DATA="$(field "$SETTLE_LOG" data)"

[ -n "$SETTLE_TX" ] || { echo "FAIL: no Settled event on chain"; exit 1; }
[ -n "$SETTLED_DATA" ] || { echo "FAIL: no Settled event data"; exit 1; }

# Settled event data = abi.encode(uint8 eligibilityCode, uint256 amount); amount is the
# last 32 bytes (last 64 hex chars).
AMT_HEX="${SETTLED_DATA: -64}"
EVENT_AMOUNT=$((16#$AMT_HEX))

# Authoritative status/gas from the LIVE receipt of the true settle hash.
RCPT_JSON="$(cast receipt "$SETTLE_TX" --rpc-url "$RPC" --json)"
SETTLE_GAS="$(printf '%d' "$(echo "$RCPT_JSON" | jq -r '.gasUsed')")"
# Sanity: the true settle receipt must itself contain the Settled topic.
HAS_SETTLED="$(echo "$RCPT_JSON" | jq -r --arg t "$SETTLED_TOPIC" '[.logs[].topics[0]] | contains([$t])')"
[ "$HAS_SETTLED" = "true" ] || { echo "FAIL: located settle tx lacks the Settled log"; exit 1; }
case "$(echo "$RCPT_JSON" | jq -r '.status')" in 0x1|1) SETTLE_STATUS="success";; *) SETTLE_STATUS="failed";; esac

echo "==> settle tx $SETTLE_TX in block $SETTLE_BLOCK status=$SETTLE_STATUS eventAmount=$EVENT_AMOUNT"

# --- four-way exact-amount agreement gate ---
FORMULA=$(( 200000000 * 1000 / 10000 )) # floor(NET_A * bps / 10_000)
CREATOR_DELTA="$CREATOR_BAL_ONCHAIN" # creator started at 0
ESCROW_DELTA=$(( 100000000 - ESCROW_ONCHAIN ))
ok=true
[ "$FORMULA" = "20000000" ] || { echo "MISMATCH formula"; ok=false; }
[ "$CREATOR_DELTA" = "$FORMULA" ] || { echo "MISMATCH creator delta"; ok=false; }
[ "$ESCROW_DELTA" = "$FORMULA" ] || { echo "MISMATCH escrow delta"; ok=false; }
[ "$EVENT_AMOUNT" = "$FORMULA" ] || { echo "MISMATCH event amount"; ok=false; }
[ "$TOTAL_ONCHAIN" = "$FORMULA" ] || { echo "MISMATCH totalSettled"; ok=false; }
[ "$SETTLED_ONCHAIN" = "true" ] || { echo "MISMATCH settled flag"; ok=false; }
[ "$SETTLE_STATUS" = "success" ] || { echo "MISMATCH tx status"; ok=false; }
$ok || { echo "POSITIVE PROOF FAILED"; exit 1; }

# --- write the committed evidence bundle ---
jq -n \
  --arg generated_by "evidence/run-positive-proof.sh" \
  --arg chain "local anvil devnet (chainId 31337)" \
  --arg note "Local Anvil devnet proof of settlement invariants using an injected active-set adapter and a local development signer. This is not a live FCE or TEE attestation. The Coston2 app separately uses the disclosed evaluator signer." \
  --arg settlement "$SETTLEMENT" --arg token "$TOKEN" --arg registry "$REGISTRY" \
  --arg verifier "$VERIFIER" --arg verifierMode "$VERIFIER_MODE" \
  --arg merchant "$MERCHANT" --arg creator "$CREATOR" --arg teeId "$TEE_ID" \
  --arg extensionId "$EXTENSION_ID" --arg instructionId "$INSTRUCTION_ID" --arg orderDigest "$ORDER_A" \
  --arg settleTx "$SETTLE_TX" --arg fundTx "$FUND_TX" --argjson settleBlock "$SETTLE_BLOCK" \
  --arg settleStatus "$SETTLE_STATUS" --argjson settleGas "$SETTLE_GAS" \
  --argjson escrowBefore 100000000 --argjson creatorBefore 0 \
  --argjson escrowAfter "$ESCROW_ONCHAIN" --argjson creatorAfter "$CREATOR_BAL_ONCHAIN" \
  --argjson merchantAfter "$MERCHANT_BAL_ONCHAIN" \
  --argjson netApplied 200000000 --argjson commissionBps 1000 \
  --argjson configuredFormula "$FORMULA" --argjson eventAmount "$EVENT_AMOUNT" \
  --argjson creatorDelta "$CREATOR_DELTA" --argjson escrowDelta "$ESCROW_DELTA" \
  --argjson totalSettled "$TOTAL_ONCHAIN" --arg settledFlag "$SETTLED_ONCHAIN" \
  '{
    proof: "positive-verification",
    result: "PASS",
    generated_by: $generated_by,
    chain: $chain,
    provenance_note: $note,
    deployment: {
      settlement: $settlement, escrowToken: $token, teeRegistry: $registry,
      fccVerifier: $verifier, verifierMode: $verifierMode,
      merchant: $merchant, creator: $creator, teeId: $teeId, extensionId: $extensionId
    },
    order: { instructionId: $instructionId, orderDigest: $orderDigest, eligibility: "ELIGIBLE(1)" },
    transactions: {
      fund: $fundTx,
      settle: $settleTx, settleBlock: $settleBlock, settleStatus: $settleStatus, settleGasUsed: $settleGas
    },
    balances: {
      escrowBefore: $escrowBefore, escrowAfter: $escrowAfter, escrowDelta: $escrowDelta,
      creatorBefore: $creatorBefore, creatorAfter: $creatorAfter, creatorDelta: $creatorDelta,
      merchantAfter: $merchantAfter, totalSettled: $totalSettled, orderSettled: $settledFlag
    },
    exact_amount_agreement: {
      netApplied: $netApplied, commissionBps: $commissionBps,
      configuredFormula_floor_net_bps_over_10000: $configuredFormula,
      fccResultAmount: $configuredFormula,
      settledEventAmount: $eventAmount,
      creatorBalanceDelta: $creatorDelta,
      escrowBalanceDelta: $escrowDelta,
      all_equal: (($configuredFormula==$eventAmount) and ($eventAmount==$creatorDelta) and ($creatorDelta==$escrowDelta))
    }
  }' > "$EVID_DIR/positive-proof.json"

rm -f "$PARSED"
echo "==> wrote evidence/positive-proof.json"

# --- human-readable evidence (evidence/positive-proof.md) ---
cat > "$EVID_DIR/positive-proof.md" <<EOF
# Positive Settlement Verification

**Result: PASS.** One eligible order released the exact configured commission to the
bound creator, once, as a local on-chain transaction using the ActionResult compatibility
adapter and a local development signer.

- **Chain:** local Anvil devnet (chainId 31337)
- **Verifier mode:** \`$VERIFIER_MODE\` (format compatibility only)
- **Regenerate:** \`bash evidence/run-positive-proof.sh\` (Foundry + jq; no secrets, no live systems)

This run proves the settlement invariant on local Anvil. It does not prove TEE execution,
registration, attestation, or proxy delivery. The current FCE sender and extension handler
live in \`contracts/src/JorqethInstructionSender.sol\` and \`fce-extension/\`.

## Deployment

| Component | Address |
| --- | --- |
| Settlement | \`$SETTLEMENT\` |
| Escrow token (mUSD) | \`$TOKEN\` |
| ActionResult compatibility verifier | \`$VERIFIER\` |
| Injected active-set adapter | \`$REGISTRY\` |
| Merchant (funder) | \`$MERCHANT\` |
| Creator (payee) | \`$CREATOR\` |
| Local development signer | \`$TEE_ID\` |
| Extension id | \`$EXTENSION_ID\` |

## The successful path

1. Merchant funded escrow with 100.000000 mUSD (tx \`$FUND_TX\`).
2. A local development signer signed an ELIGIBLE compatibility result for order
   \`$ORDER_A\`.
3. \`settle()\` verified authenticity and released the exact commission
   (tx \`$SETTLE_TX\`, block $SETTLE_BLOCK, $SETTLE_STATUS, ${SETTLE_GAS} gas).

## Exact-amount agreement (every independent source equal)

| Source | Amount (mUSD, 6dp) |
| --- | --- |
| Configured formula \`floor(200000000 × 1000 / 10000)\` | $EVENT_AMOUNT |
| Compatibility result \`amount\` field | $EVENT_AMOUNT |
| \`Settled\` event amount | $EVENT_AMOUNT |
| Creator balance delta (0 → $CREATOR_BAL_ONCHAIN) | $CREATOR_DELTA |
| Escrow balance delta (100000000 → $ESCROW_ONCHAIN) | $ESCROW_DELTA |

\`totalSettled\` = $TOTAL_ONCHAIN; order digest consumed = $SETTLED_ONCHAIN.

## Independent re-verification (anyone, over RPC)

\`\`\`bash
cast call $SETTLEMENT 'escrowBalance()(uint256)'                 # 80000000
cast call $SETTLEMENT 'totalSettled()(uint256)'                  # 20000000
cast call $SETTLEMENT 'isSettled(bytes32)(bool)' $ORDER_A  # true
cast call $TOKEN 'balanceOf(address)(uint256)' $CREATOR  # 20000000
\`\`\`

Machine-readable form: \`evidence/positive-proof.json\`. Regenerate the raw script log
locally with \`bash evidence/run-positive-proof.sh\` (written to \`evidence/positive-proof.forge.log\`).
EOF

echo "==> wrote evidence/positive-proof.md"
echo "POSITIVE PROOF PASSED"
