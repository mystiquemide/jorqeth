#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${COSTON2_RPC_URL:-https://coston2-api.flare.network/ext/C/rpc}"
TOKEN="0x4F928576d415298c260897Bd9b8CbF70D91c5Cd4"
VERIFIER="0xEA16d390d6278EBA9d4a856d32bEf9F9975463B6"
FACTORY="0x1f4F27be826ef7F12622FE6da1d86d04ffda3226"
CAMPAIGN="0x747d370dc806921c65830e1f3c9044ca6d464585"
SETTLEMENT_TX="0xca5160a0d74a3b6fc00577cd1a6c8de8260d7bf42ec454a3d4413a7aa110204f"
TEE_MANAGER="0x1a9C4A0f9D76c0b1D91d22E24E573a9b377618aE"
INSTRUCTION_SENDER="0x86bE7C32A5E566b105a224F94b3A2Ed3F751d097"
EXTENSION_ID="66159"
FCE_VERIFIER="0xf314850e31970d8337372380D183aD17a93B7F88"
FCE_FACTORY="0x9C685107E49a09760c5014031606D973aEA08C50"
FCE_CAMPAIGN="0x421856ed443fe7595e372ca508315e898d88fe24"
FCE_TEE="0x3594c83Ecf98eFb29FC31B87e57f59BcE4409Ef6"
FCE_SETTLEMENT_TX="0x6165197afcfb0c4b66bb9f4d7e8e732bafa403d11f034af504556f69dae5700a"
FCE_ORDER_DIGEST="0xcad655482c5d64cffedf9aef23829c7a9bde3539018a49ba3d712096dad8ee34"

for address in "$TOKEN" "$VERIFIER" "$FACTORY" "$CAMPAIGN" "$TEE_MANAGER" "$INSTRUCTION_SENDER" "$FCE_VERIFIER" "$FCE_FACTORY" "$FCE_CAMPAIGN"; do
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

registered_sender="$(cast call "$TEE_MANAGER" \
  'getTeeExtensionInstructionsSender(uint256)(address)' "$EXTENSION_ID" --rpc-url "$RPC_URL")"
test "${registered_sender,,}" = "${INSTRUCTION_SENDER,,}"
test "$(cast call "$INSTRUCTION_SENDER" 'extensionId()(uint256)' --rpc-url "$RPC_URL" | awk '{print $1}')" = "$EXTENSION_ID"

test "$(cast call "$FCE_FACTORY" 'isCampaign(address)(bool)' "$FCE_CAMPAIGN" --rpc-url "$RPC_URL")" = "true"
test "$(cast call "$FCE_CAMPAIGN" 'escrowBalance()(uint256)' --rpc-url "$RPC_URL" | awk '{print $1}')" = "80000000"
test "$(cast call "$FCE_CAMPAIGN" 'totalSettled()(uint256)' --rpc-url "$RPC_URL" | awk '{print $1}')" = "20000000"
test "$(cast call "$FCE_CAMPAIGN" 'isSettled(bytes32)(bool)' "$FCE_ORDER_DIGEST" --rpc-url "$RPC_URL")" = "true"
test "$(cast receipt "$FCE_SETTLEMENT_TX" --rpc-url "$RPC_URL" --json | jq -r .status)" = "0x1"

active_tees="$(cast call "$TEE_MANAGER" 'getActiveTeeMachines(uint256)(address[],string[])' "$EXTENSION_ID" --rpc-url "$RPC_URL")"
grep -qi "$FCE_TEE" <<<"$active_tees"

fce_transactions=(
  0x28dfa7f6bc75c079919595721c8917a268c0f9d6a8c6014cbe02e92d185a1855
  0x2f8bcd7140c6e801779cd8688db3aff64cb16778dcf4674595aa24d87dfdc15b
  0xa6318177ec950308fce36ebb0366b709588fa0b4043a0c04e4605d96a87030fc
  0x992bf4eea403320c5a42a5a47af065bedb49874af5c53fc4c130fea1693e76ee
  0x4b938ab482dc516da5e481ab8a8134a7544520304129a3f6b5451de59e57606d
  0xf66cbfd2cf6b2e6103cb0193646d9c3e4556e8a71a8810222042c5655a4a6bab
  0xeb6460dbb659acd4a808370452825d13873cc888cbed24acc10c393d0200d85a
  0xca2cee9765fc692fd342732eb0e66b664f34e3f50e256e8e58bffc3c73fc2f82
  0x822779782e6840a1875f2deb18691d9ce88b9e713718cff418e9262794bd56be
  0xa5e4a9c6f834788202d7735d66e8e3e973b5c0f4cc3f88a62788db3f27e1fe7d
  0xf8afb9e3bb3d4e1b3d180cbdb68f9c870d66b4c5dfedfd278a24e12aaa8f732a
  0xa6b52e94aa3809fe90094f9f229d607534ddc8bebb505e6dafa0c94f6d312b9e
  0x5fa34c4bca9a1998067f78a8121b60adf87b72e7c72e71f0bc1303dc8af579da
  0x95e0ba6b5b0607ebe48014f246a4301030957a346fad6780d3730bd0957ec1c2
  0x5deccde6b5f3a7dec64ce379708be6e12124f827acbfaf2b3f58cdfddacece5c
  0x6165197afcfb0c4b66bb9f4d7e8e732bafa403d11f034af504556f69dae5700a
)
for transaction in "${fce_transactions[@]}"; do
  test "$(cast receipt "$transaction" --rpc-url "$RPC_URL" --json | jq -r .status)" = "0x1"
done

echo "Coston2 deployment verified"
