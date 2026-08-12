# Verification Report

**Result: PASS.** 9 of 9 verification checks pass, each
resolved to a source-of-truth artifact re-run from a clean state by this script.

- **Chain:** local Anvil devnet (chainId 31337)
- **Reproduce:** `bash evidence/run-proof-gate.sh` (Foundry + jq; Go optional; no secrets, no live systems)
- **forge test:** 74 passed, 0 failed
- **Compatibility vector:** go regen skipped (toolchain go1.25 unavailable offline); covered by forge FccRealSignatureTest
- **Privacy scan:** 0 prohibited pattern(s) in committed public evidence

## Checklist

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | The settlement invariant works end to end. | PASS | forge test 74 passed / 0 failed; positive-proof.json=PASS; negative-proof.json only_eligible=true |
| 2 | The local ActionResult compatibility path gates settlement. | PASS | FccRealSignatureTest=ok; FccSettlementTest=ok; compatibility vector: go regen skipped (toolchain go1.25 unavailable offline); covered by forge FccRealSignatureTest |
| 3 | Positive proof exists and is independently inspectable. | PASS | evidence/positive-proof.{json,md}; RPC-re-verifiable via the cast calls in positive-proof.md |
| 4 | The exact eligible payout and creator balance delta agree. | PASS | positive-proof.json exact_amount_agreement.all_equal=true; creatorBalanceDelta=20000000 across formula/FCC/event/balance |
| 5 | Negative proof exists and visibly produces zero payout. | PASS | negative-proof.json paths_that_transferred_value=1 (only the eligible order); refund settles zero and is terminal (true) |
| 6 | Replay and wrong-domain attempts cannot pay. | PASS | negative-proof.json vectors: replay.paid=false, wrong_domain_chain.paid=false, wrong_domain_contract.paid=false |
| 7 | FCC timeout or infrastructure uncertainty fails closed. | PASS | negative-proof.json: infra-unknown, fleet-outage, and error-status all revert (pay zero) and do NOT consume the digest (retryable): true/true/true |
| 8 | Public evidence contains no raw merchant/customer record or credential. | PASS | privacy scan of 47 tracked files: 0 prohibited pattern(s); only the documented public anvil dev key is present |
| 9 | The complete core flow is reproducible from documented steps. | PASS | this script re-ran forge test + both proofs from a fresh anvil boot; rerun: bash evidence/run-proof-gate.sh |

## Sources of truth

- Full test suite: `forge test` (74 passing)
- Positive proof: `evidence/positive-proof.{json,md}` (eligible order pays the exact commission, once)
- Negative proof: `evidence/negative-proof.{json,md}` (every failure mode refuses to pay; escrow intact)
- ActionResult compatibility vector: `tools/tee-signer/genuine-vector.json` + `contracts/test/FccRealSignature.t.sol`

Machine-readable form: `evidence/proof-gate.json`.
