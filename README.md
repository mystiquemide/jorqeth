# Jorqeth

**Private proofs. Exact commissions.**

Jorqeth privately determines creator/affiliate commission eligibility from an agreed
merchant record and releases the exact amount from merchant-funded escrow. The
participating merchant stays the source of record. Jorqeth settles what that agreed
record shows, not universal attribution truth.

Built for the Flare Summer Signal hackathon. Testnet (Coston2) and synthetic data only.

> Status: work in progress. This repository is being built proof-first: the settlement
> invariant is enforced and tested locally before the real Flare Confidential Compute
> (FCC) integration is wired in. See "Current state" below for exactly what is and is
> not proven yet. No claim here should be read as more than what the tests demonstrate.

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
- **Milestone 2 (next):** swap in the real Flare FCC result verifier. The settlement
  contract, result schema, and tests stay unchanged.

## Contracts

| Contract | Role |
|---|---|
| `JorqethSettlement` | Escrow, domain binding, replay guard, exact/zero payout. The enforcement point. |
| `IResultVerifier` | Result-authenticity boundary (local signature now, FCC later). |
| `SignatureResultVerifier` | Milestone 1 local verifier (EIP-712 signature). |
| `JorqethResult` / `JorqethTypes` | Frozen `PayableResult` schema and struct hashing. |
| `MockUSD` | Synthetic 6-decimal test escrow token. Not a real asset. |

The frozen schema, eligibility codes, floor rounding rule, domain binding, replay
identity, and all golden vectors live in [`spec/jorqeth-v1.json`](spec/jorqeth-v1.json).

## Current state

Proven locally (30 passing tests):

- Eligible order pays the exact floor commission, once, to the bound creator.
- Refunded / unmatched order is a valid evaluation that pays zero.
- Replay, wrong chain, wrong contract, expiry, untrusted signer, tampered
  recipient/amount, and infrastructure-unknown all fail closed with no payout.
- Escrow accounting, insufficient escrow, and token-transfer failure keep state intact.

Not yet done: real FCC integration (M2), Coston2 deployment and on-chain positive /
negative proof (M3-M4), proof gate (M5), and the judge-facing surfaces (M6+).

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
