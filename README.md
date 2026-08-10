# Jorqeth

**Private proofs. Exact commissions.**

Jorqeth privately determines creator/affiliate commission eligibility from an agreed
merchant record and releases the exact amount from merchant-funded escrow. The
participating merchant stays the source of record. Jorqeth settles what that agreed
record shows, not universal attribution truth.

Built for the Flare Summer Signal hackathon. Testnet (Coston2) and synthetic data only.

> Status: proof-first build, judge-ready. The settlement invariant is enforced and
> tested locally, the real Flare Confidential Compute (FCC) result-authenticity boundary
> is reproduced byte-for-byte and swapped in under the same settlement contract, and both
> the positive and negative on-chain proofs plus a one-command proof gate run green. The
> one piece still outside our control is the live tee-node round trip on Coston2, which is
> externally blocked and stands in as simulated attestation. See "Current state" below for
> exactly what is and is not proven. No claim here should be read as more than what the
> tests demonstrate.

## The idea

A creator owed a commission cannot inspect a merchant's private order ledger, and the
merchant cannot publish customer and revenue data just to make the payout credible.
Both sides agree in advance on the record source and the settlement rule. A Flare
Compute Extension evaluates that source confidentially and returns only a minimal,
domain-bound result. A Coston2 contract releases the exact eligible commission and pays
zero for every negative or unknown case.

## Winning invariant

No valid, unexpired, correctly domain-bound result for an eligible record means no
commission can leave escrow. A valid result can release only the bound amount, to the
bound creator, once.

## Architecture

```
Judge page → orchestrator → Jorqeth settlement contract  ← minimal result ← FCE ← synthetic merchant API
                                     │
                              merchant-funded escrow → exact creator payout / zero
```

The settlement contract delegates result authenticity to an injectable
`IResultVerifier` boundary. This lets the same contract be proven locally now and run
against the real FCC verifier later without changing settlement logic:

- **Milestone 1 (done):** `SignatureResultVerifier` recovers an EIP-712 signature over
  the domain-bound result against a trusted evaluator key. Mode label:
  `local-signature-v1`. This proves the invariant end to end locally. It is **not** the
  sponsor primitive and never claims to be.
- **Milestone 2 (contract-side done):** `FccResultVerifier` reconstructs the exact hash
  the Flare TEE node signs over an `ActionResult`, recovers the secp256k1 signer, and
  accepts a result only if that signer is a currently-active TEE machine (`teeId`) for
  Jorqeth's extension, read from the on-chain registry. Swapping it under
  `JorqethSettlement` changes nothing about the settlement contract, schema, or its M1
  tests. Mode label: `flare-fcc-v1/<attestation>`, where the attestation mode is
  surfaced honestly (simulated vs production Confidential Space). The remaining step is
  the live tee-node round trip on Coston2.

The signing scheme reproduced in `FccResultVerifier` is frozen byte-for-byte from the
pinned official sources (Flare `tee-node` and `go-flare-common`), so a genuine tee-node
signature over `abi.encode(PayableResult)` verifies here unchanged.

## Contracts

| Contract | Role |
|---|---|
| `JorqethSettlement` | Escrow, domain binding, replay guard, exact/zero payout. The enforcement point. |
| `IResultVerifier` | Result-authenticity boundary (local signature or FCC, swapped at deploy). |
| `SignatureResultVerifier` | Milestone 1 local verifier (EIP-712 signature). |
| `FccResultVerifier` | Milestone 2 real FCC verifier: reconstructs the TEE `ActionResult` signature and checks the signer against the active on-chain `teeId` set. |
| `ITeeMachineRegistry` | Read-only view of the on-chain Flare TEE machine registry (active `teeId`s per extension). |
| `JorqethResult` / `JorqethTypes` | Frozen `PayableResult` schema and struct hashing. |
| `MockUSD` | Synthetic 6-decimal test escrow token. Not a real asset. |

The frozen schema, eligibility codes, floor rounding rule, domain binding, replay
identity, and all golden vectors live in [`spec/jorqeth-v1.json`](spec/jorqeth-v1.json).

## Current state

Proven locally (55 passing tests):

- Eligible order pays the exact floor commission, once, to the bound creator.
- Refunded / unmatched order is a valid evaluation that pays zero.
- Replay, wrong chain, wrong contract, expiry, untrusted signer, tampered
  recipient/amount, and infrastructure-unknown all fail closed with no payout.
- Escrow accounting, insufficient escrow, and token-transfer failure keep state intact.
- With the real `FccResultVerifier` installed, an eligible order settles the exact
  commission **only** because a registered TEE signed the result; a valid non-TEE key is
  rejected at the boundary, and removing the TEE (empty active set) halts the payable
  path entirely while escrow stays intact.

Proven on-chain and packaged for a judge:

- A funded settlement contract is deployed and every path is driven against it: the
  eligible sale pays the exact `+20.000000` mUSD commission and every other path
  (refund, replay, tampering, wrong domain, untrusted signer, expiry,
  infrastructure-unknown, error status, fleet outage) leaves escrow untouched. Across the
  whole matrix, exactly one path moves value. This is the positive proof (M3) and the
  negative / failure proof (M4).
- One command re-runs the full Foundry suite, both on-chain proofs, and a privacy scan,
  then rewrites the committed evidence: `bash evidence/run-proof-gate.sh` (M5).
- A zero-dependency, read-only judge page replays that evidence, with a settlement
  receipt, an FCC proof inspector, and a trust & product brief beside it (M6, M8). A
  cold-start rehearsal runner drives the whole thing from a clean chain (M7). See
  [`web/README.md`](web/README.md).

Still outside our control: the live tee-node round trip on Coston2. No funded Coston2
wallet is available, so the on-chain proofs run against a local chain and the verifier is
labelled `simulated-attestation`. The TEE signature scheme itself is proven byte-for-byte
against real Flare library code, which is the self-contained substitute for that blocked
round trip.

## Build and test

```bash
forge install      # fetch pinned forge-std + OpenZeppelin submodules
forge build
forge test -vvv
```

Foundry 1.7.x, Solidity 0.8.28.

## Security and privacy

- No credential, private key, raw merchant record, or customer field appears in any
  result, event, or tracked file. Order references are opaque digests.
- Infrastructure uncertainty is distinct from a legitimate zero payout; both pay nothing.
- Synthetic records and testnet assets only. Production would require an off-chain
  secret-delivery channel and a privacy/legal review.

## License

MIT.
