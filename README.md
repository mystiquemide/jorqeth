# Jorqeth

Private commission settlement for creators and affiliates, with raw merchant records kept off-chain.

[Live demo](https://jorqeth.vercel.app) · [Flare Summer Signal](https://dorahacks.io/hackathon/flaresummersignal/detail)

Built for the Flare Summer Signal hackathon. The interactive flow targets Coston2, while
the deterministic proof suite runs on a local Anvil devnet, chain ID 31337.

> The Coston2 deployment uses a disclosed testnet evaluator signer. The settlement
> contracts and FCC signature-verification path are implemented and tested, while a live
> Coston2 TEE round trip remains pending. See "Implementation status" below for exactly
> what is and is not proven.

## Problem

A creator owed a commission cannot inspect a merchant's private order ledger, and the
merchant cannot publish customer and revenue data just to make the payout credible. Both
sides agree in advance on the record source and the settlement rule. In the target
design a Flare Compute Extension evaluates that source confidentially and returns only a
minimal, domain-bound result, and a Flare contract releases the exact eligible commission
and pays zero for every negative or unknown case. The current interactive flow runs that
evaluation through a server-side testnet signer, while the production FCC evaluation and
attestation round trip remain to be connected.

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

What runs today: the Next.js app connects an injected wallet to Coston2, creates a campaign
through `JorqethCampaignFactory`, mints test mUSD, funds escrow, requests a signed private
evaluation, settles, and verifies the replay guard. The deterministic Foundry proof still
runs locally and drives every positive and negative path against funded settlement state.
Production FCE evaluation and attestation remain to be connected.

- `JorqethEvaluator.sol` derives eligibility and amount from a merchant record.
- `JorqethSettlement.sol` enforces escrow, domain binding, expiry, replay protection, terminal eligibility states, and exact payout.
- `SignatureResultVerifier.sol` is the local deterministic authenticity boundary used for the proof scripts.
- `FccResultVerifier.sol` reproduces the Flare `ActionResult` digest/signature format for compatibility testing. It is not currently wired to the official Coston2 FCE instruction lifecycle.
- `MockUSD.sol` is a synthetic six-decimal test token. It has no cash value.

## Settlement invariant

A commission cannot leave escrow unless the result is valid, unexpired, eligible, and bound to the correct campaign, chain, settlement contract, creator, and rule. A valid result can release only its bound amount and an order digest can settle only once.

The contract also prevents the merchant from reclaiming escrow before `campaignEnd`, and refuses results whose expiry extends beyond that escrow lock.

| Contract | Role |
|---|---|
| `JorqethSettlement` | Escrow, domain binding, replay guard, exact/zero payout. The enforcement point. |
| `JorqethCampaignFactory` | Creates campaign settlement contracts and records approved campaign addresses. |
| `IResultVerifier` | Result-authenticity boundary (local signature or FCC, swapped at deploy). |
| `SignatureResultVerifier` | Local test verifier (EIP-712 signature). |
| `FccResultVerifier` | FCC verifier: reconstructs the TEE `ActionResult` signature and checks the signer against the active on-chain `teeId` set. |
| `ITeeMachineRegistry` | Read-only view of the on-chain Flare TEE machine registry (active `teeId`s per extension). |
| `JorqethResult` / `JorqethTypes` | Frozen `PayableResult` schema and struct hashing. |
| `MockUSD` | Synthetic 6-decimal test escrow token. Not a real asset. |

### Prerequisites

- Git with submodule support
- Foundry with Solidity `0.8.28`
- Node.js 22 or newer
- npm
- Go `1.25.1` only if regenerating the Flare signature compatibility vector

### Working (70 passing tests)

- Eligible order pays the exact floor commission, once, to the bound creator.
- Refunded / unmatched order is a valid evaluation that pays zero.
- Replay, wrong chain, wrong contract, expiry, untrusted signer, tampered
  recipient/amount, and infrastructure-unknown all fail closed with no payout.
- Escrow accounting, insufficient escrow, and token-transfer failure keep state intact.
- With the real `FccResultVerifier` installed, an eligible order settles the exact
  commission only because a registered TEE signed the result. A valid non-TEE key is
  rejected at the boundary, and removing the TEE (empty active set) halts the payable
  path entirely while escrow stays intact.
- The campaign factory binds the merchant, creator, token, verifier, rule, percentage,
  and settlement window for every new campaign.
- The `/app` journey connects a wallet and carries a campaign through creation, funding,
  private testnet evaluation, settlement, and replay verification on Coston2 when deployed.

### Verified on-chain (local anvil)

- A funded settlement contract is deployed and every path is driven against it: the
  eligible sale pays the exact `+20.000000` mUSD commission, and every other path
  (refund, replay, tampering, wrong domain, untrusted signer, expiry,
  infrastructure-unknown, error status, fleet outage) leaves escrow untouched. Across the
  whole matrix, exactly one path moves value.
- One command re-runs the full Foundry suite, both on-chain proofs, and a privacy scan,
  then rewrites the committed evidence: `bash evidence/run-proof-gate.sh`.
- A zero-dependency, read-only page replays that evidence, alongside a settlement
  receipt, FCC verification details, and a short trust and privacy overview. A cold-start
  rehearsal runner drives the whole thing from a clean chain. See
  [`web/README.md`](web/README.md).

### Current limitation

The live tee-node round trip on Coston2 remains pending. No funded Coston2 wallet is
available, so the on-chain proofs run against a local chain and the verifier is labelled
`simulated-attestation`. The TEE signature scheme itself is verified against real Flare
library code, which stands in for that pending round trip.

## Build and test

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

Foundry 1.7.x, Solidity 0.8.28.

## Reproduce the proof

Every claim above regenerates from a clean chain with one command:

```bash
bash evidence/run-proof-gate.sh
```

That re-runs the full Foundry suite, both on-chain proofs, and a privacy scan, then
rewrites the committed evidence. It is deterministic: a fresh clone reproduces the same
`evidence/*.json`, down to the settle transaction hash and block.

Evidence index:

| File | What it proves |
|---|---|
| [`evidence/positive-proof.md`](evidence/positive-proof.md) | The eligible sale pays the exact `+20.000000` mUSD commission, with five independent amount sources in agreement. |
| [`evidence/negative-proof.md`](evidence/negative-proof.md) | Across every attempted path against one funded campaign, exactly one moves value; refund, replay, wrong domain, expiry, untrusted signer, tampering, and infrastructure-unknown all pay zero. |
| [`evidence/proof-gate.md`](evidence/proof-gate.md) | All verification checks pass in one run. |
| [`contracts/test/FccRealSignature.t.sol`](contracts/test/FccRealSignature.t.sol) | A genuine Flare tee-node signature over `abi.encode(PayableResult)` verifies against the real FCC scheme. |

## The dashboard

The primary review surface is the Next.js app in [`site/`](site/README.md). It includes
the interactive Coston2 journey, plus the full 12-path reference matrix, receipt, and
verification inspector backed by committed proof evidence.

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
