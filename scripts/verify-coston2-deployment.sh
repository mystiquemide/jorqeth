#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${COSTON2_RPC_URL:-https://coston2-api.flare.network/ext/C/rpc}"
TOKEN="0x4F928576d415298c260897Bd9b8CbF70D91c5Cd4"
VERIFIER="0xEA16d390d6278EBA9d4a856d32bEf9F9975463B6"
FACTORY="0x1f4F27be826ef7F12622FE6da1d86d04ffda3226"
CAMPAIGN="0x747d370dc806921c65830e1f3c9044ca6d464585"
SETTLEMENT_TX="0xca5160a0d74a3b6fc00577cd1a6c8de8260d7bf42ec454a3d4413a7aa110204f"

for address in "$TOKEN" "$VERIFIER" "$FACTORY" "$CAMPAIGN"; do
  code="$(cast code "$address" --rpc-url "$RPC_URL")"
  test "$code" != "0x" || { echo "no code at $address" >&2; exit 1; }
done

actual_token="$(cast call "$FACTORY" 'token()(address)' --rpc-url "$RPC_URL")"
actual_verifier="$(cast call "$FACTORY" 'verifier()(address)' --rpc-url "$RPC_URL")"
test "${actual_token,,}" = "${TOKEN,,}"
test "${actual_verifier,,}" = "${VERIFIER,,}"
test "$(cast call "$FACTORY" 'isCampaign(address)(bool)' "$CAMPAIGN" --rpc-url "$RPC_URL")" = "true"

status="$(cast receipt "$SETTLEMENT_TX" --rpc-url "$RPC_URL" --json | jq -r .status)"
test "$status" = "0x1"

echo "Coston2 deployment verified"
