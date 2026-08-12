# Coston2 FXRP cutover

Jorqeth's settlement contracts are ERC-20 agnostic, but each `JorqethCampaignFactory` stores one
immutable settlement token. The existing live FCE factory remains bound to MockUSD, so the FXRP
primary path needs one new factory deployment that reuses the existing FCE verifier.

## Canonical Coston2 asset

Flare Testnet Coston2 FTestXRP / test FXRP:

```text
0x0b6A3645c240605887a5532109323A3E12273dc7
```

The token uses 6 decimals.

Existing Jorqeth FCE verifier reused by the new factory:

```text
0xf314850e31970d8337372380D183aD17a93B7F88
```

No new instruction sender, extension ID, TEE registration, proxy, or verifier is required.

## 1. Deploy the FXRP-bound campaign factory

Run this from the persistent Jorqeth checkout that already has access to the Coston2 deployer key.
Do not paste the key into chat, commit it, or echo it.

```bash
cd /root/projects/jorqeth
git pull --ff-only

set -a
. /root/.config/jorqeth/coston2-deployment.env
set +a

export JORQETH_FCE_VERIFIER_ADDRESS=0xf314850e31970d8337372380D183aD17a93B7F88
export JORQETH_FXRP_TOKEN_ADDRESS=0x0b6A3645c240605887a5532109323A3E12273dc7

forge script script/DeployFxrpFactory.s.sol:DeployFxrpFactory \
  --rpc-url "$COSTON2_RPC_URL" \
  --broadcast
```

Record only the printed `FXRP JorqethCampaignFactory` address and deployment transaction. Do not
record or expose the deployer key.

## 2. Verify the factory before web cutover

For the new factory address `$FXRP_FACTORY`, verify its immutable token and verifier through RPC or
Cast before changing Vercel:

```bash
cast call "$FXRP_FACTORY" 'token()(address)' --rpc-url "$COSTON2_RPC_URL"
cast call "$FXRP_FACTORY" 'verifier()(address)' --rpc-url "$COSTON2_RPC_URL"
```

Expected token:

```text
0x0b6A3645c240605887a5532109323A3E12273dc7
```

Expected verifier:

```text
0xf314850e31970d8337372380D183aD17a93B7F88
```

## 3. Cut production to FXRP

Set these **Production** environment variables on the existing Jorqeth Vercel project:

```text
NEXT_PUBLIC_JORQETH_FXRP_TOKEN_ADDRESS=0x0b6A3645c240605887a5532109323A3E12273dc7
NEXT_PUBLIC_JORQETH_FXRP_FACTORY_ADDRESS=<new factory address>
```

`NEXT_PUBLIC_JORQETH_FXRP_FACTORY_ADDRESS` is the cutover switch. Until it exists, `/app` keeps the
current proven MockUSD FCE flow. Once it exists and the app is redeployed, `/app` automatically:

- creates campaigns through the FXRP-bound factory,
- checks the connected wallet's FTestXRP balance,
- approves FTestXRP to the campaign,
- funds escrow without calling the MockUSD `mint()` function,
- labels payouts as test FXRP.

The FCE result bridge remains server-only through `JORQETH_FCE_PROXY_URL` and does not change.

## 4. Demo funding

The official Flare Coston2 faucet supplies test FXRP. The app links directly to:

```text
https://faucet.flare.network/
```

The current private `private-order-1` runtime record represents 100 units. To avoid changing the
private runtime record during cutover, the FXRP UI defaults to:

```text
5 test FXRP escrow
1% commission
100-unit eligible private record
1 test FXRP verified payout
```

The escrow is a payout budget, so it does not need to equal the private sale amount.

## 5. Live proof gate

Do not replace the current public mUSD proof until a genuine hosted FXRP run succeeds.

Required evidence for the FXRP proof:

1. New FXRP campaign address.
2. `token()` on that campaign equals the official Coston2 FTestXRP address.
3. Merchant test-FXRP balance decreases by the funded amount.
4. FCE instruction transaction and instruction ID.
5. Signed ActionResult accepted by the existing active-TEE verifier.
6. Creator FTestXRP balance increases by exactly 1 FXRP for the default 1% demo.
7. Campaign escrow decreases from 5 FXRP to 4 FXRP.
8. Replay of the same order digest is rejected.
9. Private order reference and underlying merchant record are absent from the public result.

Only after those checks pass should the landing page and `/proof` be promoted from the historical
mUSD evidence to the new FXRP evidence.
