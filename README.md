# Jorqeth

**Private commission settlement on Flare using Flare Confidential Compute and FXRP.**

Jorqeth lets merchants settle creator and affiliate commissions from private commercial records without publishing the underlying customer, order, or revenue data onchain.

A merchant fixes the recipient and commission rule, Jorqeth evaluates the agreed private record through a Flare Compute Extension, and the settlement contract releases exactly the verified amount in FXRP on Flare.

- **Live app:** [jorqeth.vercel.app](https://jorqeth.vercel.app)
- **Technical proof:** [jorqeth.vercel.app/proof](https://jorqeth.vercel.app/proof)
- **Network:** Flare Testnet Coston2, chain ID `114`
- **Settlement asset:** Coston2 FTestXRP / test FXRP
- **Built for:** Flare Summer Signal · Confidential Compute Apps

## Overview

Commission payments often depend on merchant data that should not be public. A creator or affiliate needs confidence that the payout is correct, while the merchant may need to keep customer details, order data, and revenue records confidential.

Jorqeth separates the private record from the public settlement.

The merchant defines who gets paid and the commission percentage. A Jorqeth Flare Compute Extension (FCE) evaluates the agreed merchant record inside the Flare Confidential Compute (FCC) execution path. The resulting `ActionResult` is verified before the settlement contract can release funds.

Only the information required to authorize and settle the payout is exposed to the public payment flow.

## How it works

1. Connect a wallet to Flare Coston2.
2. Choose the creator or affiliate payout address.
3. Set the commission rate and create the payment configuration.
4. Submit the agreed private order reference for evaluation.
5. Jorqeth sends an instruction through Flare Confidential Compute.
6. The Jorqeth FCE evaluates the private merchant record and returns a signed result.
7. `FccResultVerifier` authenticates the result against the active TEE set.
8. The settlement contract checks the campaign, recipient, rule, chain, expiry, and replay state.
9. The merchant funds the payment with test FXRP.
10. Jorqeth releases exactly the authorized FXRP amount to the recipient.
11. The recipient can inspect the receipt and verify the settlement on Flare.

## Architecture

```text
Private merchant record
        |
        v
JorqethInstructionSender
        |
        v
Flare Confidential Compute
        |
        v
Jorqeth Flare Compute Extension
        |
        v
Trusted Execution Environment
        |
        v
Signed Flare ActionResult
        |
        v
FccResultVerifier
        |
        v
JorqethSettlement
        |
        v
Exact FXRP payout on Coston2
```

Flare Confidential Compute provides the instruction and TEE execution path. Jorqeth owns the application-specific pieces at the edges of that flow: the onchain instruction sender, the FCE business logic, result verification, and settlement rules.

The settlement contract does not trust a payout amount calculated by the browser. Funds move only after the returned result has been authenticated and bound to the expected settlement context.

## Flare integration

Jorqeth uses two Flare-native components in the primary product flow.

### Flare Confidential Compute

Jorqeth uses Flare Confidential Compute to evaluate private merchant records outside the public EVM state while keeping the result usable by onchain settlement logic.

`JorqethInstructionSender` dispatches the instruction. The Jorqeth FCE processes the private input through the TEE stack and returns a signed `ActionResult`. `FccResultVerifier` verifies the result against the active TEE set before the settlement contract accepts it.

The result is then checked against:

- campaign
- recipient
- commission rule
- chain ID
- expiry
- replay state

### FXRP

The primary settlement path uses Coston2 FTestXRP as test FXRP.

The merchant funds the payment with FXRP and Jorqeth releases only the commission amount authorized by the verified confidential-compute result. The FXRP path does not depend on a Jorqeth-owned token `mint()` function.

Official Coston2 FXRP address discovery is documented by Flare here: [Get FXRP Address](https://dev.flare.network/fxrp/token-interactions/fxrp-address).

## Privacy model

Raw merchant records and credentials stay inside the evaluation boundary. The browser and public chain do not need the customer ledger or private revenue fields to settle a commission.

The public result contains only the domain-bound fields required to verify and execute the payout.

Jorqeth does not prove commercial facts outside the agreed merchant data source. It verifies and settles what that configured source reports.

## Coston2 deployment

| Component | Address |
| --- | --- |
| FTestXRP / test FXRP | `0x0b6A3645c240605887a5532109323A3E12273dc7` |
| Jorqeth FXRP campaign factory | `0xF5D10934c08955fcaCA7b1b5dAF59b99d86DEa99` |
| Jorqeth FCE instruction sender | `0x86bE7C32A5E566b105a224F94b3A2Ed3F751d097` |
| FCE `ActionResult` verifier | `0xf314850e31970d8337372380D183aD17a93B7F88` |

Factory deployment transaction:

```text
0xc9067b63ed6efd01794f89af25beb01011fec2df12488b3f660bed7fe3433a22
```

The FXRP cutover record is committed at [`deployments/coston2-fxrp-cutover.md`](deployments/coston2-fxrp-cutover.md).

### Historical test components

The repository retains the earlier mUSD path for regression and evidence compatibility. It is not the primary product path.

| Component | Address |
| --- | --- |
| Historical mUSD FCE factory | `0x9C685107E49a09760c5014031606D973aEA08C50` |
| MockUSD legacy fallback token | `0x4F928576d415298c260897Bd9b8CbF70D91c5Cd4` |
| Historical `SignatureResultVerifier` | `0xEA16d390d6278EBA9d4a856d32bEf9F9975463B6` |
| Historical disclosed-signer factory | `0x1f4F27be826ef7F12622FE6da1d86d04ffda3226` |

## Contracts

| Contract | Role |
| --- | --- |
| `JorqethSettlement` | Escrow, domain binding, replay protection, and exact-or-zero ERC-20 payout |
| `JorqethCampaignFactory` | Creates and records fixed payment configurations |
| `JorqethInstructionSender` | Selects an active Flare TEE and dispatches FCC instructions |
| `FccResultVerifier` | Verifies Flare `ActionResult` signatures against the active TEE set |
| `SignatureResultVerifier` | Historical trusted-signer verifier retained for compatibility |

The frozen result schema and golden vectors live in [`spec/jorqeth-v1.json`](spec/jorqeth-v1.json).

## End-to-end Coston2 proof

The repository includes a completed FCC-backed settlement on Coston2 using the FXRP-bound flow.

| Evidence | Result |
| --- | --- |
| Campaign | `0x07D1251A5D94C7e833215016EBBbB774833091b4` |
| FCC instruction transaction | `0xb5a838d9efe0ab286fd545d58eaf6dc7ead9c80205fba2f51d67c7a3f32c19fb` |
| Instruction ID | `0xe96856c93c4507b35620819dfc78bb1bc254396e32e8183a45a60022b36958d2` |
| Active TEE signer | `0x9103b8400FAae0a243508F577398CD9FbfbEb5fd` |
| Decoded commission | `3 FTestXRP` |
| Recipient balance change | `+3 FTestXRP` |
| Remaining escrow | `5 FTestXRP` |
| Settlement transaction | `0x29044f953279d925295947cf36c9200bd58d4ddaa5291f6e0c8f752f8d48938f` |
| Replay attempt | Rejected |

Evidence is committed in:

- [`deployments/coston2-live-demo.json`](deployments/coston2-live-demo.json)
- [`deployments/coston2-fce-proof.json`](deployments/coston2-fce-proof.json)
- [`deployments/coston2-fxrp-cutover.md`](deployments/coston2-fxrp-cutover.md)
- [`evidence/`](evidence/)

The returned result does not contain the private order reference or underlying merchant record.

## Hosted FCC runtime

The live application reaches the FCC result bridge through the server-only `JORQETH_FCE_PROXY_URL` environment variable. The browser does not receive the proxy URL.

Public result endpoint:

```text
https://jorqeth-fce.breachresponse.xyz
```

Application readiness endpoint:

```text
https://jorqeth.vercel.app/api/fce-result?health=1
```

A healthy deployment returns both `configured` and `ready` as `true`.

The persistent runtime contains the Flare C-chain indexer, MySQL, Redis, the extension proxy, and the Jorqeth TEE extension. Database, Redis, and internal TEE/proxy ports remain private.

## Testnet boundary

The current FCC runtime uses Flare's supported simulated-TEE mode against the real Coston2 chain.

The instruction transaction, signed result, active-TEE registry check, verifier path, and settlement are real Coston2 interactions. The current deployment does not claim hardware-backed production attestation.

Coston2 FTestXRP and the historical mUSD token are testnet assets with no real-world value.

## QA

The repository includes a read-only QA CLI for deployment health, configuration checks, source drift, and proof verification.

```bash
npm run doctor
npm run config:check
npm run health
npm run deploy:check
npm run qa
npm run qa:full
```

Use `npm run cli -- --help` for options including `--url`, `--timeout`, `--json`, and `--ci`.

Reports are written to:

```text
artifacts/qa/summary.json
artifacts/qa/summary.md
artifacts/qa/junit.xml
```

## Repository checks

Smart contracts:

```bash
forge fmt --check
forge build
forge test -vvv
```

Flare Compute Extension:

```bash
cd fce-extension
go test ./...
go vet ./...
```

TEE signer tooling:

```bash
cd tools/tee-signer
go test ./...
go vet ./...
```

Web application:

```bash
cd site
npm ci
npm run typecheck
npm run build
```

Run the deterministic proof gate from the repository root:

```bash
bash evidence/run-proof-gate.sh
```

The Foundry suite uses local Anvil with chain ID `31337`. That local development environment is separate from the committed Coston2 proof.

## FCC runtime configuration

Tracked files under `deploy/fce-coston2` are deployment templates. Keep database passwords, proxy signing keys, private merchant records, and other runtime secrets in ignored environment files or an external secret store.

The web application expects the extension proxy result route:

```text
GET /action/result/{instructionId}
```

The `/info` route is used for readiness checks.

## Current limits

- The current deployment uses simulated-TEE testnet mode rather than hardware-backed production attestation.
- Jorqeth currently uses a configured merchant-record source rather than a production commerce connector.
- Production use requires confidential credential delivery, operational monitoring, and legal and privacy review.

## License

MIT. See [LICENSE](LICENSE).
