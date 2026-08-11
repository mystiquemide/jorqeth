# Failure-Path Verification

**Result: PASS.** Against one funded campaign, eleven hostile or failure paths were
attempted plus a forced TEE-fleet outage. Exactly one path, the single approved
eligible order, moved value, and it moved exactly the commission. Every other path
paid nothing, and each reverting path reverted for the expected reason.

- **Chain:** local anvil devnet (chainId 31337) with synthetic records, same rationale as the positive proof
- **Verifier mode:** `flare-fcc-v1/simulated-attestation` (honestly labelled; not production hardware)
- **Regenerate:** `bash evidence/run-negative-proof.sh` (Foundry + jq; no secrets, no live systems)

## Outcome per attempt

| # | Attempt | settle() | Value moved | Reverted with |
| --- | --- | --- | --- | --- |
| 0 | refund_ineligible | returned | 0 | - (settled zero) |
| 1 | wrong_domain_chain | reverted | 0 | `WrongChain(uint256,uint256)` |
| 2 | wrong_domain_contract | reverted | 0 | `WrongContract(address,address)` |
| 3 | untrusted_signer | reverted | 0 | `BadResult()` |
| 4 | tampered_amount | reverted | 0 | `BadResult()` |
| 5 | tampered_creator | reverted | 0 | `WrongCreator(address,address)` |
| 6 | expired | reverted | 0 | `Expired(uint64,uint256)` |
| 7 | infrastructure_unknown | reverted | 0 | `NonPayableCode(uint8)` |
| 8 | eligible_positive | returned | 20000000 | - |
| 9 | replay | reverted | 0 | `AlreadySettled(bytes32)` |
| 10 | error_status | reverted | 0 | `BadResult()` |
| 11 | fleet_outage (empty TEE set) | reverted | 0 | `EmptyRegistry()` |

## Settlement invariant (read back over RPC)

- Paths that transferred value: **1** (only `eligible_positive`).
- Creator final balance: **20000000** (= exact commission).
- Escrow final: **80000000** (funded 100000000 − commission 20000000).
- `totalSettled`: **20000000**.

## Legitimate ineligibility vs infrastructure unknown

- Refund (`refund_ineligible`, ORDER_B): `settle()` **returns**, pays zero, and the
  digest is **consumed** (`isSettled` = true). A terminal business outcome.
- Infrastructure unknown (`infrastructure_unknown`, ORDER_C, code 2): `settle()`
  **reverts**, pays zero, and the digest is **not consumed** (`isSettled` = false).
- Fleet outage (`fleet_outage`, ORDER_E, empty TEE set): `settle()` **reverts**, pays
  zero, and the digest is **not consumed** (`isSettled` = false), retryable
  once infra recovers.
- Error status (`error_status`, ORDER_F): a genuinely TEE-signed result whose
  ActionResult status is error (tee-node status 0), not success. The signature is
  authentic and the Data decodes to a payable eligible outcome, but the verifier
  pins status to OK, so `settle()` **reverts** (`BadResult()`), pays zero, and the
  digest is **not consumed** (`isSettled` = false), retryable like a timeout.

That difference, settled-zero versus reverted-and-retryable, is how a genuine
"no commission owed" is told apart from "we could not decide".

Machine-readable form: `evidence/negative-proof.json`. Regenerate the raw script log
locally with `bash evidence/run-negative-proof.sh` (written to `evidence/negative-proof.forge.log`).
