# Milestone 3 — Positive Proof

**Result: PASS.** One eligible order released the exact configured commission to the
bound creator, once, as a real on-chain transaction, only because a registered TEE
machine signed the result under the frozen FCC scheme.

- **Chain:** local anvil devnet (chainId 31337 — the chain the genuine tee-node vector targets)
- **Verifier mode:** `flare-fcc-v1/simulated-attestation` (honestly labelled; not production hardware)
- **Regenerate:** `bash evidence/run-positive-proof.sh` (Foundry + jq; no secrets, no live systems)

Coston2 was the plan's target chain. A fully-live, production-attested FCC round trip
there is externally blocked (BLK-001/BLK-002): no funded Coston2 wallet is available to
the executor and public Coston2 rejects simulated attestation. This local run is the
honest substitute — same contracts, same FCC verifier scheme, same exact-payout
invariant. That the signature *bytes* match real Flare library code is proven separately,
byte-for-byte, by `tools/tee-signer` and `contracts/test/FccRealSignature.t.sol`.

## Deployment

| Component | Address |
| --- | --- |
| Settlement | `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9` |
| Escrow token (mUSD) | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| FCC result verifier | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` |
| TEE machine registry | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| Merchant (funder) | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Creator (payee) | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Registered teeId (signer) | `0xC9fe5A864FbE024a2cc46d0dF6b2F5e2417204ca` |
| Extension id | `65536` |

## The successful path

1. Merchant funded escrow with 100.000000 mUSD (tx `0x19a353c9fa2ec31734423368819d1f961a57f9e456a8e8bba0d71dc76250ce7a`).
2. A registered TEE machine signed an ELIGIBLE result for order
   `0xbe4b0fa03136646a52108527f8dd4873c60796d246fe5dd610ec0d4a2f6a1a45` under the frozen ActionResult scheme.
3. `settle()` verified authenticity and released the exact commission
   (tx `0x693ffaa455af5cf8e124d3f8c0067361a3e901eaa55f5aee3c9ccfaa6b4816ee`, block 2, success, 138849 gas).

## Exact-amount agreement (every independent source equal)

| Source | Amount (mUSD, 6dp) |
| --- | --- |
| Configured formula `floor(200000000 × 1000 / 10000)` | 20000000 |
| FCC result `amount` field | 20000000 |
| `Settled` event amount | 20000000 |
| Creator balance delta (0 → 20000000) | 20000000 |
| Escrow balance delta (100000000 → 80000000) | 20000000 |

`totalSettled` = 20000000; order digest consumed = true.

## Independent re-verification (anyone, over RPC)

```bash
cast call 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 'escrowBalance()(uint256)'                 # 80000000
cast call 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 'totalSettled()(uint256)'                  # 20000000
cast call 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 'isSettled(bytes32)(bool)' 0xbe4b0fa03136646a52108527f8dd4873c60796d246fe5dd610ec0d4a2f6a1a45  # true
cast call 0x5FbDB2315678afecb367f032d93F642f64180aa3 'balanceOf(address)(uint256)' 0x70997970C51812dc3A010C7d01b50e0d17dc79C8  # 20000000
```

Machine-readable form: `evidence/positive-proof.json`. Regenerate the raw script log
locally with `bash evidence/run-positive-proof.sh` (written to `evidence/positive-proof.forge.log`).
