# Coston2 FXRP cutover

Jorqeth's settlement contracts are ERC-20 agnostic, but each `JorqethCampaignFactory` stores one
immutable settlement token. The original live FCE factory remains bound to MockUSD. The primary
FXRP path therefore uses a separate factory while reusing the existing FCE verifier.

## Canonical Coston2 asset

Flare Testnet Coston2 FTestXRP / test FXRP:

```text
0x0b6A3645c240605887a5532109323A3E12273dc7
```

The token uses 6 decimals.

Existing Jorqeth FCE verifier reused by the FXRP factory:

```text
0xf314850e31970d8337372380D183aD17a93B7F88
```

No new instruction sender, extension ID, TEE registration, proxy, or verifier was required.

## Deployed FXRP factory

Canonical Jorqeth FXRP campaign factory:

```text
0xF5D10934c08955fcaCA7b1b5dAF59b99d86DEa99
```

Deployment transaction:

```text
0xc9067b63ed6efd01794f89af25beb01011fec2df12488b3f660bed7fe3433a22
```

The deployment was independently read back from Coston2 through the Vercel preview runtime before
production activation. The checks returned:

```text
receipt status: success
contract address: 0xF5D10934c08955fcaCA7b1b5dAF59b99d86DEa99
bytecode present: true
token(): 0x0b6A3645c240605887a5532109323A3E12273dc7
verifier(): 0xf314850e31970d8337372380D183aD17a93B7F88
```

That confirms the factory is bound to the intended Coston2 FTestXRP token and the existing Jorqeth
FCE ActionResult verifier.

## Production activation

The canonical Coston2 FXRP token and factory addresses are now public deployment defaults in the
web application. Environment variables can still override them for a future redeployment:

```text
NEXT_PUBLIC_JORQETH_FXRP_TOKEN_ADDRESS=0x0b6A3645c240605887a5532109323A3E12273dc7
NEXT_PUBLIC_JORQETH_FXRP_FACTORY_ADDRESS=0xF5D10934c08955fcaCA7b1b5dAF59b99d86DEa99
```

The primary `/app` therefore:

- creates campaigns through the FXRP-bound factory,
- checks the connected wallet's FTestXRP balance,
- approves FTestXRP to the campaign,
- funds escrow without calling the MockUSD `mint()` function,
- labels payouts as test FXRP.

The FCE result bridge remains server-only through `JORQETH_FCE_PROXY_URL` and does not change.

## Demo funding

The official Flare Coston2 faucet supplies test FXRP. The app links directly to:

```text
https://faucet.flare.network/
```

The current private `private-order-1` runtime record represents 100 units. The FXRP UI defaults to:

```text
5 test FXRP escrow
1% commission
100-unit eligible private record
1 test FXRP verified payout
```

The escrow is a payout budget, so it does not need to equal the private sale amount.

## Live proof gate

The existing public 20 mUSD proof remains historical evidence of the genuine hosted FCE path. Do
not relabel that evidence as FXRP.

Required evidence for the new FXRP proof:

1. New FXRP campaign address.
2. `token()` on that campaign equals the official Coston2 FTestXRP address.
3. Merchant test-FXRP balance decreases by the funded amount.
4. FCE instruction transaction and instruction ID.
5. Signed ActionResult accepted by the existing active-TEE verifier.
6. Creator FTestXRP balance increases by exactly 1 FXRP for the default 1% demo.
7. Campaign escrow decreases from 5 FXRP to 4 FXRP.
8. Replay of the same order digest is rejected.
9. Private order reference and underlying merchant record are absent from the public result.

Only after those checks pass should `/proof` replace the historical mUSD evidence with the new FXRP
evidence.
