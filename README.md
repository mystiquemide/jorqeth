# Jorqeth

Private commission settlement for creators and affiliates, with raw merchant records kept off-chain.

[Live demo](https://jorqeth.vercel.app) · [Flare Summer Signal](https://dorahacks.io/hackathon/flaresummersignal/detail)

Jorqeth lets a merchant fund escrow and fix a commission rule before settlement. An evaluator derives a minimal `PayableResult` from an agreed merchant record, and the settlement contract releases only the exact bound amount to the bound creator, once.

> **Submission status:** the committed repository proves the settlement invariant on a local Anvil chain with synthetic records and includes Flare `ActionResult` signature-format compatibility tests. Production Flare Confidential Compute attestation is **not connected yet**. The current Vercel production deployment also contains a newer Coston2 user flow whose source commit is not present on GitHub. That source/provenance gap must be reconciled before final submission.

## Problem

Creators and affiliates often depend on merchant-owned order data to verify commissions. Publishing the underlying customer and revenue ledger is not acceptable, while a merchant-provided screenshot or spreadsheet is not independently enforceable.

Jorqeth is designed around a narrower claim: both parties agree on the record source and payout rule, the eligibility calculation happens away from the public chain, and only the minimum settlement result is allowed to reach the contract.

## Core user flow

1. The merchant creates a campaign with a creator, commission rate, rule version, and campaign end.
2. The merchant funds escrow before any payout can occur.
3. An agreed merchant record is evaluated into an eligibility code and exact amount.
4. The result is bound to the campaign, creator, settlement contract, chain, rule, nonce, issue time, and expiry.
5. `JorqethSettlement` verifies the result and releases the exact eligible amount once.
6. Refunds and unmatched records settle to zero. Unknown infrastructure states fail closed and remain retryable.

## What the repository proves today

| Surface | Evidence | Status |
| --- | --- | --- |
| Commission rule | `contracts/src/JorqethEvaluator.sol` | Implemented |
| Escrow funding and exact settlement | `contracts/src/JorqethSettlement.sol` | Implemented |
| Replay, expiry, domain and recipient binding | Foundry tests under `contracts/test/` | Implemented |
| Synthetic merchant-record derivation | `contracts/test/SyntheticMerchantSource.sol` plus proof scripts | Implemented |
| Positive and negative proof artifacts | `evidence/` | Committed |
| Proof mirror used by the Next.js viewer | `site/data/` checked byte-for-byte against `evidence/` | Implemented |
| Flare `ActionResult` hashing/signature compatibility | `tools/tee-signer/` and `contracts/test/FccRealSignature.t.sol` | Implemented as a compatibility proof |
| Current Flare FCE instruction routing and TEE registration | No current FCE extension in this repository | Not implemented |
| Production FCC attestation | No Confidential Space / production TEE round trip | Not implemented |
| Coston2 user flow shown by the current Vercel deployment | Production deployment exists, but its source commit is not on GitHub | Source gap |

The Foundry suite currently contains **68 passing contract tests across 8 suites** in the last green CI baseline. The proof gate records **9/9 checks** and the committed evidence shows exactly one paying path out of twelve tested settlement paths.

## Why Flare Confidential Compute matters

The target architecture needs confidential execution because the input is the merchant's private order record. A normal public smart contract cannot inspect that record without revealing it.

The intended Flare flow is:

```text
merchant record
    |
    v
Flare Compute Extension in a TEE
    |
    | minimal signed ActionResult
    v
Jorqeth result boundary
    |
    v
JorqethSettlement on Flare
    |
    v
exact creator payout
```

Current Flare documentation routes instructions through an on-chain instruction sender, uses `TeeMachineRegistry.getRandomTeeIds(extensionId, count)` to select a TEE, and sends the instruction through `TeeExtensionRegistry`. The repository does **not** currently implement that full instruction lifecycle.

`FccResultVerifier.sol` is therefore treated as a **signature compatibility prototype**, not a production Coston2 verifier. It reconstructs the pinned Flare `ActionResult` signing digest and checks the recovered signer against a deterministic signer-set adapter used by local tests. The adapter method `getActiveTeeMachines` is not the current official FCE `TeeMachineRegistry` ABI and must not be presented as a deployable Coston2 trust boundary.

Removing the Flare-specific signature construction from the compatibility proof breaks the FCC-format verification tests, but the current local settlement can still run with `SignatureResultVerifier`. That is why the remaining live FCE integration is a material hackathon risk rather than something hidden behind wording.

## Architecture

```text
spec/jorqeth-v1.json
        |
        +--> JorqethEvaluator --> PayableResult
        |                         |
        |                         v
        |                  IResultVerifier
        |                   /           \
        |       local EIP-712         Flare ActionResult
        |       test verifier         compatibility verifier
        |                         |
        +-------------------------+
                                  v
                         JorqethSettlement
                                  |
                                  v
                           exact escrow payout
```

Important contracts:

- `JorqethEvaluator.sol` derives eligibility and amount from a merchant record.
- `JorqethSettlement.sol` enforces escrow, domain binding, expiry, replay protection, terminal eligibility states, and exact payout.
- `SignatureResultVerifier.sol` is the local deterministic authenticity boundary used for the proof scripts.
- `FccResultVerifier.sol` reproduces the Flare `ActionResult` digest/signature format for compatibility testing. It is not currently wired to the official Coston2 FCE instruction lifecycle.
- `MockUSD.sol` is a synthetic six-decimal test token. It has no cash value.

## Settlement invariant

A commission cannot leave escrow unless the result is valid, unexpired, eligible, and bound to the correct campaign, chain, settlement contract, creator, and rule. A valid result can release only its bound amount and an order digest can settle only once.

The contract also prevents the merchant from reclaiming escrow before `campaignEnd`, and refuses results whose expiry extends beyond that escrow lock.

## Reproducible local verification

### Prerequisites

- Git with submodule support
- Foundry with Solidity `0.8.28`
- Node.js 22 or newer
- npm
- Go `1.25.1` only if regenerating the Flare signature compatibility vector

### Clone

```bash
git clone --recurse-submodules https://github.com/mystiquemide/jorqeth.git
cd jorqeth
```

If you cloned without submodules:

```bash
git submodule update --init --recursive
```

### Contracts

```bash
forge fmt --check
forge build
forge test -vvv
```

### Proof viewer

```bash
cd site
npm ci
npm run typecheck
npm run build
npm run dev
```

The viewer reads committed proof JSON. It does not manufacture new settlement results in the browser.

### Flare signature compatibility helper

```bash
cd tools/tee-signer
gofmt -d .
go test ./...
go vet ./...
go run .
```

The helper uses pinned Flare `tee-node` and `go-flare-common` libraries to reproduce the hashing/signing primitives used for an `ActionResult`. The committed vector uses the well-known public Anvil account-0 key and chain `31337`; it is test material, not a confidential TEE key.

## Environment variables

Local contracts, committed evidence, and the proof viewer require no secrets.

For optional Coston2 RPC or explorer work, copy the example:

```bash
cp .env.example .env
```

| Variable | Required for local proof | Purpose |
| --- | --- | --- |
| `COSTON2_RPC_URL` | No | Coston2 RPC endpoint used by Foundry when explicitly selecting that endpoint |
| `FLARE_EXPLORER_API_KEY` | No | Optional explorer verification key |

Never commit funded private keys, API tokens, or a populated `.env` file.

## Evidence and claim map

| Claim | Repository evidence |
| --- | --- |
| Eligible order pays the fixed-rate floor amount | `JorqethEvaluator.sol`, evaluator tests, positive proof |
| Refund and unmatched records pay zero | evaluator tests and negative proof |
| Unknown evaluator state cannot pay | evaluator plus settlement tests |
| Exact amount is bound to the signed result | result schema, verifier tests, tamper tests |
| Wrong creator/chain/contract/rule cannot pay | settlement negative tests |
| Replay cannot pay twice | replay guard tests and negative proof |
| Escrow cannot be withdrawn before the settlement window closes | settlement invariant tests |
| Flare library hashing/signing primitives match the Solidity reconstruction | `tools/tee-signer`, `FccRealSignature.t.sol` |
| Production FCC is live | **Not claimed. Not proven by this repository.** |

## Repository layout

```text
.
├── .github/workflows/ci.yml        # reproducibility checks
├── contracts/
│   ├── src/                        # evaluator, settlement, verifier boundaries
│   └── test/                       # Foundry unit, invariant and compatibility tests
├── evidence/                       # committed positive/negative/proof-gate artifacts
├── lib/                            # Foundry git submodules
├── script/                         # proof-generation scripts
├── site/                           # Next.js proof viewer
├── spec/jorqeth-v1.json            # frozen schema, records and golden outcomes
├── tools/tee-signer/               # Flare signature-format compatibility vector tool
└── web/                            # legacy zero-dependency evidence viewer/tests
```

The `web/` viewer is retained because CI still exercises its pure replay-state tests. `site/` is the primary repository UI.

## Deployment status

- Target network: Flare Coston2, chain ID `114`.
- Committed proof network: local Anvil, chain ID `31337`.
- Live UI: `https://jorqeth.vercel.app`.
- Production FCC attestation: not connected.
- GitHub deployment records: none.
- Current Vercel production source provenance: the deployed Coston2 flow was built by Vercel CLI from a local commit not present in this GitHub repository. Do not treat the live deployment as reproducible from `main` until that source is reconciled.

No Coston2 contract address is documented here because this GitHub revision does not contain the source/deployment record necessary to verify the live deployment independently.

## Security considerations

- Escrow transfers use OpenZeppelin `SafeERC20` and `ReentrancyGuard`.
- Settlement validates schema, campaign, chain, contract, creator, rule, timestamps and eligibility before payout.
- Replay protection is keyed by order digest.
- Ineligible outcomes must carry amount zero.
- Infrastructure-unknown outcomes cannot settle.
- Merchant withdrawals remain locked until `campaignEnd`.
- `.env`, key files and common secret files are ignored.
- The committed Anvil private key in the signature vector is a public development key and must never hold real funds.

This is hackathon/testnet software, not an audited production payment system.

## New work during Summer Signal

The repository history starts inside the hackathon development window. The current implementation adds the evaluator, escrow settlement state machine, deterministic specification, positive/negative proof scripts, adversarial Foundry coverage, Flare signature compatibility proof, and judge-facing evidence viewer.

The next material work is not more documentation. It is to move the evaluator into the current official FCE scaffold, execute the instruction/TEE/result lifecycle on Coston2, bind the returned signer/result to settlement using the current sponsor interfaces, commit that source, and record the resulting addresses and transactions.

## Known limitations

1. The production FCC round trip is missing.
2. `FccResultVerifier` uses a deterministic local signer-set adapter that is not the current official Coston2 `TeeMachineRegistry` ABI.
3. The live Coston2 UI was deployed from source that is ahead of and absent from GitHub `main`.
4. Merchant records and the escrow token in the committed proof are synthetic.
5. No external smart-contract audit has been performed.

## License

MIT. See [LICENSE](LICENSE).
