# Jorqeth

**Private proofs. Exact commissions.**

Jorqeth is a privacy-preserving commission settlement system built with Flare
Confidential Compute. It verifies commission eligibility without exposing the merchant's
underlying order data, then releases the exact eligible amount from escrow. The
participating merchant stays the source of record: Jorqeth settles what that agreed
record shows, not universal attribution truth.

Built for the Flare Summer Signal hackathon. Coston2 is the target chain; the committed
proofs run on a local anvil devnet (chainId 31337) with synthetic data only.

> The current implementation uses synthetic merchant data and local simulated
> attestation. The settlement contracts and FCC signature-verification path are
> implemented and tested, while a live Coston2 TEE round trip remains pending. See
> "Implementation status" below for exactly what is and is not proven.

## The problem

A creator owed a commission cannot inspect a merchant's private order ledger, and the
merchant cannot publish customer and revenue data just to make the payout credible. Both
sides agree in advance on the record source and the settlement rule. In the target
design a Flare Compute Extension evaluates that source confidentially and returns only a
minimal, domain-bound result, and a Flare contract releases the exact eligible commission
and pays zero for every negative or unknown case. Today that boundary runs locally: the
settlement contract and its result verifier run on a local devnet against synthetic
records, with the extension's signature reproduced from the real Flare scheme. The
extension evaluation and the Coston2 round trip are the parts still to build.

## Settlement invariant

Escrow releases a commission only when the result is valid, unexpired, eligible, and
bound to the correct creator, campaign, contract, and chain. Each eligible result can
settle only once and only for the approved amount.

## Architecture

Target design:

```
client → orchestrator → Jorqeth settlement contract  ← minimal result ← FCE ← merchant record source
                                 │
                          merchant-funded escrow → exact creator payout / zero
```

What runs today (local anvil, chainId 31337): a Foundry proof script builds the synthetic
domain-bound results, signs them with the trusted evaluator key through
`SignatureResultVerifier`, and drives every path against a funded `JorqethSettlement`. The
dashboard and the zero-dependency page replay the committed evidence. There is no live
orchestrator, FCE, merchant API, or Coston2 deployment yet: the confidential extension
evaluation, the orchestration, and the Coston2 round trip are the parts still to build.

`JorqethSettlement` uses an `IResultVerifier` interface to verify settlement results. The
verifier can be swapped without changing the settlement logic, so the same contract runs
locally now and against the real FCC verifier later:

- `SignatureResultVerifier` provides the local test verifier. It recovers an EIP-712
  signature over the domain-bound result against a trusted evaluator key. Mode label:
  `local-signature-v1`. It is not the sponsor primitive and never claims to be.
- `FccResultVerifier` verifies FCC-compatible TEE signatures against the active Flare TEE
  registry. It reconstructs the exact hash the Flare TEE node signs over an
  `ActionResult`, recovers the secp256k1 signer, and accepts a result only if that signer
  is a currently-active TEE machine (`teeId`) for Jorqeth's extension, read from the
  on-chain registry. Swapping it under `JorqethSettlement` changes nothing about the
  settlement contract, schema, or its tests. Mode label: `flare-fcc-v1/<attestation>`,
  where the attestation mode is surfaced honestly (simulated vs production Confidential
  Space). The remaining step is the live tee-node round trip on Coston2.

The signing scheme reproduced in `FccResultVerifier` is taken unchanged from the pinned
official sources (Flare `tee-node` and `go-flare-common`), so a genuine tee-node
signature over `abi.encode(PayableResult)` verifies here unchanged.

## Contracts

| Contract | Role |
|---|---|
| `JorqethSettlement` | Escrow, domain binding, replay guard, exact/zero payout. The enforcement point. |
| `IResultVerifier` | Result-authenticity boundary (local signature or FCC, swapped at deploy). |
| `SignatureResultVerifier` | Local test verifier (EIP-712 signature). |
| `FccResultVerifier` | FCC verifier: reconstructs the TEE `ActionResult` signature and checks the signer against the active on-chain `teeId` set. |
| `ITeeMachineRegistry` | Read-only view of the on-chain Flare TEE machine registry (active `teeId`s per extension). |
| `JorqethResult` / `JorqethTypes` | Frozen `PayableResult` schema and struct hashing. |
| `MockUSD` | Synthetic 6-decimal test escrow token. Not a real asset. |

The frozen schema, eligibility codes, floor rounding rule, domain binding, replay
identity, and all golden vectors live in [`spec/jorqeth-v1.json`](spec/jorqeth-v1.json).

## Implementation status

### Working (61 passing tests)

- Eligible order pays the exact floor commission, once, to the bound creator.
- Refunded / unmatched order is a valid evaluation that pays zero.
- Replay, wrong chain, wrong contract, expiry, untrusted signer, tampered
  recipient/amount, and infrastructure-unknown all fail closed with no payout.
- Escrow accounting, insufficient escrow, and token-transfer failure keep state intact.
- With the real `FccResultVerifier` installed, an eligible order settles the exact
  commission only because a registered TEE signed the result. A valid non-TEE key is
  rejected at the boundary, and removing the TEE (empty active set) halts the payable
  path entirely while escrow stays intact.

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
forge install      # fetch pinned forge-std + OpenZeppelin submodules
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

The primary review surface is the Next.js dashboard in [`site/`](site/README.md). It
reads every figure from the committed proof, with a settlement dashboard, the full
12-path matrix, a receipt, and a verification inspector.

```bash
cd site
npm ci
npm run build && npm run start   # http://localhost:3000  (open /app first)
```

Routes, evidence sync, and deployment are documented in [`site/README.md`](site/README.md).
`/app` is the page to open first.

### Fallback: the zero-dependency replay

If a build step is not wanted, a zero-dependency, read-only page replays the same
committed evidence, alongside a settlement receipt, FCC verification details, and a short
trust and privacy overview. No chain call, no build step:

```bash
node web/serve.mjs          # http://127.0.0.1:8080
```

See [`web/README.md`](web/README.md) for the surfaces, tests, and design notes. Both
frontends render the identical committed proof: the dashboard is the intended demo, the
replay is the no-build fallback.

## Two frontends

- **`site/`** is the product website and interactive demo (Next.js). It is the canonical
  review surface.
- **`web/`** is a standalone verification viewer: a single zero-dependency page plus three
  read-only views over the same committed evidence, with no build step.

## Hackathon scope

Built during Flare Summer Signal (this repository's contribution):

- `JorqethSettlement`, `SignatureResultVerifier`, `FccResultVerifier`, the frozen
  `PayableResult` schema and hashing, and the `MockUSD` synthetic escrow token.
- The full local and on-chain proof pipeline (`evidence/run-*.sh`), the deterministic
  positive/negative/gate evidence, and the cold-start rehearsal runner.
- The zero-dependency verification viewer and its three read-only views.
- The Next.js dashboard in `site/`, which renders the same committed proof as the
  canonical demo surface (see `site/README.md`).
- `tools/tee-signer`: a small tool that re-derives a genuine tee-node signature vector
  from the pinned official Flare sources, so the on-chain FCC test runs against real bytes.

Reused unchanged (not this project's work):

- The Flare Confidential Compute signing scheme itself, taken from the pinned official
  `tee-node` and `go-flare-common` sources. `FccResultVerifier` reconstructs the exact
  hash a genuine TEE node signs; it does not invent a scheme.
- forge-std and OpenZeppelin, pinned as submodules.

## Limitations

- **Merchant-source dependence.** Jorqeth settles what the agreed merchant record shows,
  not objective attribution outside that source.
- **Fixed refund snapshot.** Eligibility is evaluated at settlement time, not reconciled
  against later disputes.
- **One connector.** A single synthetic merchant record source is wired, not a production
  commerce integration.
- **Non-production FCC.** No funded Coston2 wallet is available, so the on-chain proofs run
  on a local devnet with simulated attestation; a live Coston2 Confidential Space round
  trip remains pending. The genuine signature proof against real Flare code stands in for
  that one pending step.

## Roadmap

1. Production secret delivery: an off-chain confidential channel to hand the extension its
   merchant credential under real attestation.
2. Merchant pilot connector: one real commerce record source behind the same
   minimal-result boundary.
3. Settlement-window and refund finality: a dispute window before a payout becomes
   irreversible.

## Security and privacy

- No production credential, secret key, raw merchant record, or customer field appears in
  any result, event, or tracked file. Order references are opaque digests. The only key in
  the repository is the public Anvil account-0 test key (shared by every Foundry install),
  used solely to reproduce the FCC signature scheme against a local devnet.
- Infrastructure uncertainty is distinct from a legitimate zero payout; both pay nothing.
- Synthetic records and testnet assets only. Production would require an off-chain
  secret-delivery channel and a privacy/legal review.

## License

MIT. See [`LICENSE`](LICENSE).
