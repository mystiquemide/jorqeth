# Jorqeth

**Private commission settlement powered by Flare Confidential Compute.**

Jorqeth privately checks an agreed merchant record, calculates the exact creator or affiliate
commission, and settles it on Flare Coston2 without exposing the underlying customer, order,
or revenue data.

**Built for Flare Summer Signal · Confidential Compute Apps**

- Live app: [jorqeth.vercel.app](https://jorqeth.vercel.app)
- Live proof: [jorqeth.vercel.app/proof](https://jorqeth.vercel.app/proof)
- Network: Flare Testnet Coston2, chain `114`

## The problem

Creators and affiliates are often paid from private merchant ledgers they cannot inspect. The
merchant cannot publish customer and revenue data just to prove a commission is fair, so payout
verification often falls back to screenshots, exports, or trust.

Jorqeth fixes the record source and commission rule before settlement. Flare Confidential Compute
privately evaluates the agreed record, and the settlement contract releases only the verified
amount to the bound recipient.

## Why Flare

Flare is part of Jorqeth's trust path, not a cosmetic settlement network.

```text
Merchant funds campaign on Flare Coston2
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
       Exact commission on Coston2
```

Coston2 hosts the escrow and settlement contracts. Flare FCE routes the private evaluation to the
registered TEE, and Jorqeth authenticates the signed result against the active TEE set before any
escrow can move.

## Live hosted FCE proof

The public app has completed a genuine end-to-end FCE-backed settlement using the demo reference
`private-order-1`.

| Evidence | Live result |
| --- | --- |
| Campaign | `0x5e77dfD9c2142B7e9e7A11017b0B5417EC5A9cc6` |
| FCE instruction tx | `0x8142d704296efd6d9e6dd87a6aac1e3ce1abb5c4d643422d524b3d86eac02d47` |
| Instruction ID | `0x315b46e12fe1dcce3387155bcb69c8b321bc3c082875ce6101b4e9e09504a052` |
| Active TEE signer | `0x9103b8400FAae0a243508F577398CD9FbfbEb5fd` |
| Decoded commission | `20 mUSD` |
| Creator balance change | `+20 mUSD` |
| Remaining escrow | `80 mUSD` |
| Settlement tx | `0xf8269c7aab0ad00ed8695cc07d6defb7d5f019b58068b0ddfc1cf283d74fc4a6` |
| Replay attempt | Rejected |

The live-run summary is committed at
[`deployments/coston2-live-demo.json`](deployments/coston2-live-demo.json). The detailed earlier
FCE proof bundle remains at
[`deployments/coston2-fce-proof.json`](deployments/coston2-fce-proof.json).

The returned result did not contain the private order reference or the underlying merchant record.
The public result contains only the domain-bound fields needed to verify and settle the payout.

> **Testnet boundary:** this run uses Flare's supported simulated-TEE mode on Coston2. The FCE
> instruction, signed result, active-TEE registry check, verifier path, and settlement are real
> testnet interactions, but this is not a claim of hardware-backed production attestation.

## Product flow

The primary `/app` journey is deliberately written for a normal user:

1. Connect a wallet to Flare Coston2.
2. Choose the creator or affiliate payout wallet and commission rate.
3. Fund the campaign with test mUSD.
4. Enter the agreed private order reference.
5. Run the private verification with Flare Confidential Compute.
6. Review the verified amount and settle it on Flare.
7. Confirm the payout and paid-once protection.

The disclosed-signer route remains separately available at `/app/demo` as a fallback test flow. It
is not the primary product path.

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
| MockUSD | `0x4F928576d415298c260897Bd9b8CbF70D91c5Cd4` |
| SignatureResultVerifier | `0xEA16d390d6278EBA9d4a856d32bEf9F9975463B6` |
| Demo campaign factory | `0x1f4F27be826ef7F12622FE6da1d86d04ffda3226` |
| FCE instruction sender | `0x86bE7C32A5E566b105a224F94b3A2Ed3F751d097` |
| FCE ActionResult verifier | `0xf314850e31970d8337372380D183aD17a93B7F88` |
| FCE campaign factory | `0x9C685107E49a09760c5014031606D973aEA08C50` |

| Contract | Role |
| --- | --- |
| `JorqethSettlement` | Escrow, domain binding, replay guard, exact-or-zero payout |
| `JorqethCampaignFactory` | Creates and records fixed campaign deployments |
| `JorqethInstructionSender` | Selects an active Flare TEE and dispatches the FCE evaluation |
| `FccResultVerifier` | Verifies raw Flare `ActionResult` signatures against the active TEE set |
| `SignatureResultVerifier` | Disclosed trusted-signer verifier used only by the fallback demo |
| `MockUSD` | Six-decimal Coston2 test token with no cash value |

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
- The Coston2 mUSD token has no real-world value.
- The current FCE runtime uses simulated-TEE testnet mode, not hardware-backed production
  attestation.
- Production use requires confidential credential delivery, a real commerce connector,
  operational monitoring, and legal and privacy review.

## License

MIT. See [LICENSE](LICENSE).
