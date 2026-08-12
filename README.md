# Jorqeth

**Private FXRP commission settlement powered by Flare Confidential Compute.**

Jorqeth lets a merchant fund a commission campaign with test FXRP, privately evaluate an agreed
merchant record with Flare Confidential Compute, and release the exact XRP-denominated creator or
affiliate payout on Flare Coston2 without exposing the underlying customer, order, or revenue data.

**Built for Flare Summer Signal · Confidential Compute Apps**

- Live app: [jorqeth.vercel.app](https://jorqeth.vercel.app)
- Completed FCE proof: [jorqeth.vercel.app/proof](https://jorqeth.vercel.app/proof)
- Network: Flare Testnet Coston2, chain `114`
- Primary settlement asset: Coston2 FTestXRP / test FXRP

## The problem

Creators and affiliates are often paid from private merchant ledgers they cannot inspect. The
merchant cannot publish customer and revenue data just to prove a commission is fair, so payout
verification often falls back to screenshots, exports, or trust.

Jorqeth fixes the record source and commission rule before settlement. Flare Confidential Compute
privately evaluates the agreed record, and the settlement contract releases only the verified
amount to the bound recipient.

## Why Flare

Flare is part of Jorqeth's trust path and settlement asset layer.

```text
Merchant funds campaign with test FXRP on Coston2
                         |
                         v
               Jorqeth FCE instruction
                         |
                         v
            Flare Confidential Compute
                         |
                         v
             Registered active testnet TEE
                         |
                         v
               Signed Flare ActionResult
                         |
                         v
                 FccResultVerifier
                         |
                         v
             Exact FXRP payout on Coston2
```

Jorqeth combines two Flare-native pieces:

1. **FTestXRP / FXRP** as the campaign settlement asset.
2. **Flare Confidential Compute** as the private evaluation and signed-result path.

The contracts do not trust a browser-calculated payout. The FCE result is authenticated against the
active TEE set and then checked against the campaign, recipient, rule, chain, expiry, and replay
state before escrow can move.

## Primary product flow

The primary `/app` journey is written for a normal user:

1. Connect a wallet to Flare Coston2.
2. Choose the creator or affiliate payout wallet and commission rate.
3. Fund the campaign with test FXRP.
4. Enter the agreed private order reference.
5. Run the private verification with Flare Confidential Compute.
6. Review the signed amount and settle the exact FXRP commission on Flare.
7. Confirm the payout and paid-once protection.

The app checks the connected wallet's FTestXRP balance and links the official Flare faucet when test
FXRP is needed. Unlike the historical MockUSD path, the FXRP path does not call a Jorqeth-owned
`mint()` function.

The disclosed-signer route remains separately available at `/app/demo` as a fallback test flow. It
is not the primary product path.

## Canonical Coston2 FXRP deployment

Official Coston2 FTestXRP:

```text
0x0b6A3645c240605887a5532109323A3E12273dc7
```

Jorqeth FXRP campaign factory:

```text
0xF5D10934c08955fcaCA7b1b5dAF59b99d86DEa99
```

Factory deployment transaction:

```text
0xc9067b63ed6efd01794f89af25beb01011fec2df12488b3f660bed7fe3433a22
```

Before production activation, the deployment was read back from Coston2 and confirmed to have
bytecode, a successful deployment receipt, the intended FTestXRP `token()`, and the existing Jorqeth
FCE verifier as `verifier()`.

The full cutover record is committed at
[`deployments/coston2-fxrp-cutover.md`](deployments/coston2-fxrp-cutover.md).

## Completed hosted FCE proof

Jorqeth already has a genuine hosted end-to-end FCE-backed settlement proving the confidential
compute and settlement lifecycle. That completed run predates the FXRP cutover and therefore used
the original test mUSD asset.

| Evidence | Completed result |
| --- | --- |
| Campaign | `0x5e77dfD9c2142B7e9e7A11017b0B5417EC5A9cc6` |
| FCE instruction tx | `0x8142d704296efd6d9e6dd87a6aac1e3ce1abb5c4d643422d524b3d86eac02d47` |
| Instruction ID | `0x315b46e12fe1dcce3387155bcb69c8b321bc3c082875ce6101b4e9e09504a052` |
| Active TEE signer | `0x9103b8400FAae0a243508F577398CD9FbfbEb5fd` |
| Historical decoded commission | `20 mUSD` |
| Historical creator balance change | `+20 mUSD` |
| Historical remaining escrow | `80 mUSD` |
| Settlement tx | `0xf8269c7aab0ad00ed8695cc07d6defb7d5f019b58068b0ddfc1cf283d74fc4a6` |
| Replay attempt | Rejected |

The live-run summary is committed at
[`deployments/coston2-live-demo.json`](deployments/coston2-live-demo.json). The earlier detailed FCE
proof bundle remains at [`deployments/coston2-fce-proof.json`](deployments/coston2-fce-proof.json).

The returned result did not contain the private order reference or the underlying merchant record.
The public result contains only the domain-bound fields needed to verify and settle the payout.

The historical mUSD evidence is deliberately not relabeled as FXRP. A new FXRP proof replaces it
only after a genuine hosted FXRP settlement produces its own instruction and settlement
transactions.

> **Testnet boundary:** the current runtime uses Flare's supported simulated-TEE mode on Coston2.
> The FCE instruction, signed result, active-TEE registry check, verifier path, and settlement are
> real testnet interactions, but this is not a claim of hardware-backed production attestation.

## Hosted runtime

The live web deployment is connected to the FCE result bridge through the server-only
`JORQETH_FCE_PROXY_URL` Vercel variable. The browser never receives the proxy URL.

Current public FCE result endpoint:

```text
https://jorqeth-fce.breachresponse.xyz
```

Readiness can be checked through the application boundary:

```text
https://jorqeth.vercel.app/api/fce-result?health=1
```

A healthy deployment returns both `configured` and `ready` as `true`.

The persistent runtime contains MySQL, the Flare C-chain indexer, Redis, tee-proxy, and the Jorqeth
TEE/extension. Only the external result endpoint is intended to be public. Database, Redis, and
internal TEE/proxy ports stay private.

## What stays private

Raw merchant records and credentials stay inside the evaluation boundary. The browser and public
chain do not need the customer ledger, revenue fields, or private keys. Jorqeth uses an opaque order
digest and returns only the minimum result required for settlement.

## Coston2 contracts

| Component | Address |
| --- | --- |
| FTestXRP / test FXRP | `0x0b6A3645c240605887a5532109323A3E12273dc7` |
| FXRP campaign factory | `0xF5D10934c08955fcaCA7b1b5dAF59b99d86DEa99` |
| FCE instruction sender | `0x86bE7C32A5E566b105a224F94b3A2Ed3F751d097` |
| FCE ActionResult verifier | `0xf314850e31970d8337372380D183aD17a93B7F88` |
| Historical mUSD FCE factory | `0x9C685107E49a09760c5014031606D973aEA08C50` |
| MockUSD fallback token | `0x4F928576d415298c260897Bd9b8CbF70D91c5Cd4` |
| SignatureResultVerifier fallback | `0xEA16d390d6278EBA9d4a856d32bEf9F9975463B6` |
| Disclosed-signer demo factory | `0x1f4F27be826ef7F12622FE6da1d86d04ffda3226` |

| Contract | Role |
| --- | --- |
| `JorqethSettlement` | Escrow, domain binding, replay guard, exact-or-zero ERC-20 payout |
| `JorqethCampaignFactory` | Creates and records fixed campaign deployments |
| `JorqethInstructionSender` | Selects an active Flare TEE and dispatches the FCE evaluation |
| `FccResultVerifier` | Verifies raw Flare `ActionResult` signatures against the active TEE set |
| `SignatureResultVerifier` | Disclosed trusted-signer verifier used only by the fallback demo |
| `MockUSD` | Historical six-decimal test asset retained for fallback/evidence compatibility |

The frozen result schema and golden vectors live in
[`spec/jorqeth-v1.json`](spec/jorqeth-v1.json).

## Run the repository checks

```bash
forge fmt --check
forge build
forge test -vvv

cd fce-extension
go test ./...
go vet ./...

cd ../tools/tee-signer
go test ./...
go vet ./...

cd ../../site
npm ci
npm run typecheck
npm run build
```

Run `bash evidence/run-proof-gate.sh` for the deterministic evidence gate. The Foundry test suite
uses local Anvil, chain ID `31337`; that environment is a local devnet and is separate from the
public Coston2 proof.

## FCE runtime configuration

The tracked deployment files under `deploy/fce-coston2` are templates. Keep database passwords,
proxy signing keys, and private merchant records in an ignored `.env` or other runtime-only config.
Do not commit them.

The external tee-proxy route required by the web application is:

```text
GET /action/result/{instructionId}
```

The `/info` route is used for readiness checks.

## Limits

- Jorqeth settles what the agreed merchant record source reports. It does not prove attribution
  outside that source.
- Coston2 FTestXRP and the historical mUSD token are testnet assets with no real-world payout value.
- The current FCE runtime uses simulated-TEE testnet mode, not hardware-backed production
  attestation.
- Production use requires confidential credential delivery, a real commerce connector,
  operational monitoring, and legal and privacy review.

## License

MIT. See [LICENSE](LICENSE).
