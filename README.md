# Jorqeth

Private proofs. Exact commissions.

Jorqeth settles creator commissions from merchant-controlled records without putting raw
customer or order data on-chain. A campaign escrows test mUSD, evaluates an opaque order
digest, and pays the exact floor commission once when every domain and authenticity check
passes.

The interactive app is live on Coston2 at [jorqeth.vercel.app](https://jorqeth.vercel.app).
The primary `/app` flow creates an FCE-bound campaign, funds escrow, sends the evaluation
through Flare Confidential Compute, polls the signed TEE `ActionResult`, verifies the
active TEE signer on-chain, settles the exact payout, and proves that replay is rejected.
The disclosed-signer fallback remains available separately at `/app/demo`.

## Current status

- The complete Flare Compute Extension source is implemented in
  [`JorqethInstructionSender.sol`](contracts/src/JorqethInstructionSender.sol) and
  [`fce-extension/`](fce-extension/). The sender uses `getRandomTeeIds` followed by
  `sendInstructions`, and the extension handles the official `POST /action` wire format.
- Extension `66159` has an active simulated TEE registered through FlareTeeManager on
  Coston2. The committed proof records instruction `0x9bf8867c...`, its raw signed
  `ActionResult`, and settlement transaction `0x6165197a...`.
- [`FccResultVerifier.sol`](contracts/src/FccResultVerifier.sol) reconstructs Flare's
  ActionResult signing hash and accepts the signer only when it is in the current
  MachineManager active set for the Jorqeth extension.
- The primary interactive path now mirrors Flare's current test flow: the wallet calls
  `JorqethInstructionSender.sendEvaluation`, the server polls the configured tee-proxy at
  `/action/result/{instructionId}`, and the returned TEE signature is passed to
  `FccResultVerifier` during settlement.
- The web deployment needs the server-only `JORQETH_FCE_PROXY_URL` environment variable
  set to the public HTTPS tee-proxy endpoint. The UI checks this before allowing an FCE
  instruction, so a missing runtime endpoint cannot create a half-finished demo flow.

## Architecture

```text
wallet -> FCE campaign factory -> funded settlement
                    |
                    v
        JorqethInstructionSender
                    |
                    v
          Flare FCE registry
                    |
                    v
             active TEE
                    |
                    v
         signed ActionResult
                    |
                    v
          FccResultVerifier
                    |
                    v
          exact payout or zero

fallback demo -> disclosed testnet evaluator signer -> SignatureResultVerifier
```

Raw order references and merchant credentials stay inside the evaluation boundary. The
public result contains an opaque digest, eligibility, exact amount, creator, campaign,
chain, settlement contract, rule version, nonce, and validity window.

## Coston2 deployment

| Component | Address |
| --- | --- |
| MockUSD | `0x4F928576d415298c260897Bd9b8CbF70D91c5Cd4` |
| SignatureResultVerifier | `0xEA16d390d6278EBA9d4a856d32bEf9F9975463B6` |
| Demo campaign factory | `0x1f4F27be826ef7F12622FE6da1d86d04ffda3226` |
| FCE instruction sender | `0x86bE7C32A5E566b105a224F94b3A2Ed3F751d097` |
| FCE ActionResult verifier | `0xf314850e31970d8337372380D183aD17a93B7F88` |
| FCE campaign factory | `0x9C685107E49a09760c5014031606D973aEA08C50` |
| FCE verified campaign | `0x421856ed443fe7595e372ca508315e898d88fe24` |

The manifest and verification command are in
[`deployments/coston2.json`](deployments/coston2.json) and
[`deployments/coston2-fce-proof.json`](deployments/coston2-fce-proof.json), with the
on-chain checks in
[`scripts/verify-coston2-deployment.sh`](scripts/verify-coston2-deployment.sh).

The contract also prevents the merchant from reclaiming escrow before `campaignEnd`, and refuses results whose expiry extends beyond that escrow lock.

| Contract | Role |
| --- | --- |
| `JorqethSettlement` | Escrow, domain binding, replay guard, exact or zero payout |
| `JorqethCampaignFactory` | Creates and records fixed campaign deployments |
| `SignatureResultVerifier` | Disclosed trusted-signer verifier used by the fallback demo |
| `JorqethInstructionSender` | Current FCE instruction selection and dispatch |
| `FccResultVerifier` | Raw Flare ActionResult verification against the active TEE set |
| `MockUSD` | Six-decimal Coston2 test token with no cash value |

The frozen result schema and golden vectors live in
[`spec/jorqeth-v1.json`](spec/jorqeth-v1.json).

## Verify locally

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
npx tsc --noEmit
npm run build
```

For the browser FCE flow, also set:

```bash
JORQETH_FCE_PROXY_URL=https://your-public-tee-proxy.example
```

That endpoint must expose Flare tee-proxy's `GET /action/result/{instructionId}` route for
extension `66159`. The browser never receives this URL directly; the Next.js server polls
it through `/api/fce-result`.

The Foundry suite uses local Anvil, chain ID 31337. That environment is a local devnet,
not a public testnet. Run `bash evidence/run-proof-gate.sh` to regenerate the deterministic
settlement evidence.

## Limits

- Jorqeth settles what the agreed merchant record source reports. It does not prove
  attribution outside that source.
- The token used on Coston2 has no real-world value.
- The FCE proof uses Flare's supported simulated-TEE testnet mode, not hardware-backed
  production attestation.
- The hosted FCE interaction requires a reachable HTTPS tee-proxy result endpoint.
- Production use needs confidential credential delivery, a real commerce connector,
  operational monitoring, and legal and privacy review.

## License

MIT. See [LICENSE](LICENSE).
