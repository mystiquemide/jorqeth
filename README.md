# Jorqeth

Private proofs. Exact commissions.

Jorqeth settles creator commissions from merchant-controlled records without putting raw
customer or order data on-chain. A campaign escrows test mUSD, evaluates an opaque order
digest, and pays the exact floor commission once when every domain and authenticity check
passes.

The interactive app is live on Coston2 at [jorqeth.vercel.app](https://jorqeth.vercel.app).
It creates campaigns, funds escrow, requests an evaluation, settles the result, and proves
that replay is rejected.

## Current status

- The deployed Coston2 settlement flow uses a disclosed server-side evaluator signer.
- The current Flare Compute Extension source is implemented in
  [`JorqethInstructionSender.sol`](contracts/src/JorqethInstructionSender.sol) and
  [`fce-extension/`](fce-extension/). The sender uses `getRandomTeeIds` followed by
  `sendInstructions`, and the extension handles the official `POST /action` wire format.
- A full Coston2 TEE, proxy, and signed `ActionResponse` round trip still needs Flare
  indexer access. The live app does not claim hardware-backed attestation.
- [`FccResultVerifier.sol`](contracts/src/FccResultVerifier.sol) is an ActionResult
  signature-format compatibility adapter used by the local proof suite. Its injected
  active-set interface is not presented as the current Flare registry ABI.

## Architecture

```text
wallet -> Coston2 campaign factory -> funded settlement -> exact payout or zero
                    |
                    +-> current app: disclosed testnet evaluator signer
                    +-> FCE path: instruction sender -> selected TEE -> /action -> ActionResult
```

Raw order references and merchant credentials stay inside the evaluation boundary. The
public result contains an opaque digest, eligibility, exact amount, creator, campaign,
chain, settlement contract, rule version, nonce, and validity window.

## Coston2 deployment

| Component | Address |
| --- | --- |
| MockUSD | `0x4F928576d415298c260897Bd9b8CbF70D91c5Cd4` |
| SignatureResultVerifier | `0xEA16d390d6278EBA9d4a856d32bEf9F9975463B6` |
| JorqethCampaignFactory | `0x1f4F27be826ef7F12622FE6da1d86d04ffda3226` |
| Verified campaign | `0x747d370dc806921c65830e1f3c9044ca6d464585` |

The manifest and verification command are in
[`deployments/coston2.json`](deployments/coston2.json) and
[`scripts/verify-coston2-deployment.sh`](scripts/verify-coston2-deployment.sh).

The contract also prevents the merchant from reclaiming escrow before `campaignEnd`, and refuses results whose expiry extends beyond that escrow lock.

| Contract | Role |
| --- | --- |
| `JorqethSettlement` | Escrow, domain binding, replay guard, exact or zero payout |
| `JorqethCampaignFactory` | Creates and records fixed campaign deployments |
| `SignatureResultVerifier` | Disclosed trusted-signer verifier used on Coston2 today |
| `JorqethInstructionSender` | Current FCE instruction selection and dispatch |
| `FccResultVerifier` | Local ActionResult signature-format compatibility adapter |
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

The Foundry suite uses local Anvil, chain ID 31337. That environment is a local devnet,
not a public testnet. Run `bash evidence/run-proof-gate.sh` to regenerate the deterministic
settlement evidence.

## Limits

- Jorqeth settles what the agreed merchant record source reports. It does not prove
  attribution outside that source.
- The token and records used in tests have no real-world value.
- The Coston2 app currently trusts the disclosed evaluator signer.
- Production use needs a live FCE deployment, confidential credential delivery, a real
  commerce connector, operational monitoring, and legal and privacy review.

## License

MIT. See [LICENSE](LICENSE).
