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

The public app has completed a genuine end-to-end FCE-backed settlement using the FXRP-bound
campaign and the private reference `private-order-1`.

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

The legacy mUSD Flare Confidential Compute route remains separately available at `/app/demo` as a
fallback test flow. It is not the primary product path.

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
compute and settlement lifecycle. The committed completed run uses the canonical Coston2 FTestXRP
asset. The original mUSD proof remains historical evidence for the legacy fallback.

| Evidence | Completed result |
| --- | --- |
| Campaign | `0x07D1251A5D94C7e833215016EBBbB774833091b4` |
| FCE instruction tx | `0xb5a838d9efe0ab286fd545d58eaf6dc7ead9c80205fba2f51d67c7a3f32c19fb` |
| Instruction ID | `0xe96856c93c4507b35620819dfc78bb1bc254396e32e8183a45a60022b36958d2` |
| Active TEE signer | `0x9103b8400FAae0a243508F577398CD9FbfbEb5fd` |
| Decoded commission | `3 FTestXRP` |
| Creator balance change | `+3 FTestXRP` |
| Remaining escrow | `5 FTestXRP` |
| Settlement tx | `0x29044f953279d925295947cf36c9200bd58d4ddaa5291f6e0c8f752f8d48938f` |
| Replay attempt | Rejected |

The live-run summary is committed at
[`deployments/coston2-live-demo.json`](deployments/coston2-live-demo.json). The earlier detailed FCE
proof bundle remains at [`deployments/coston2-fce-proof.json`](deployments/coston2-fce-proof.json).

The returned result did not contain the private order reference or the underlying merchant record.
The public result contains only the domain-bound fields needed to verify and settle the payout.

> **Testnet boundary:** the current runtime uses Flare's supported simulated-TEE mode on Coston2.
> The FCE instruction, signed result, active-TEE registry check, verifier path, and settlement are
> real testnet interactions, but this is not a claim of hardware-backed production attestation.

The earlier mUSD proof bundle remains available in
[`deployments/coston2-fce-proof.json`](deployments/coston2-fce-proof.json) as historical evidence.

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
| MockUSD legacy fallback token | `0x4F928576d415298c260897Bd9b8CbF70D91c5Cd4` |
| Historical SignatureResultVerifier | `0xEA16d390d6278EBA9d4a856d32bEf9F9975463B6` |
| Historical disclosed-signer factory | `0x1f4F27be826ef7F12622FE6da1d86d04ffda3226` |

| Contract | Role |
| --- | --- |
| `JorqethSettlement` | Escrow, domain binding, replay guard, exact-or-zero ERC-20 payout |
| `JorqethCampaignFactory` | Creates and records fixed campaign deployments |
| `JorqethInstructionSender` | Selects an active Flare TEE and dispatches the FCE evaluation |
| `FccResultVerifier` | Verifies raw Flare `ActionResult` signatures against the active TEE set |
| `SignatureResultVerifier` | Historical disclosed trusted-signer verifier retained for contract and evidence compatibility |
| `FTestXRP` | Six-decimal Coston2 test token with no cash value |
| `MockUSD` | Historical six-decimal test asset retained for fallback/evidence compatibility |

The frozen result schema and golden vectors live in
[`spec/jorqeth-v1.json`](spec/jorqeth-v1.json).

## Production QA CLI

The repository includes a read-only CLI for release checks, deployment health, source drift, and
proof verification. It never asks for a production wallet, resets data, or writes to Coston2.

```bash
npm run doctor
npm run config:check
npm run health
npm run deploy:check
npm run qa
npm run qa:full
```

Use `npm run cli -- --help` for flags such as `--url`, `--timeout`, `--json`, and `--ci`. Reports
are written to `artifacts/qa/summary.json`, `artifacts/qa/summary.md`, and
`artifacts/qa/junit.xml`.

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
