# Positive Settlement Verification

**Result: PASS.** One eligible order released the exact configured commission to the
bound creator, once, as a local on-chain transaction using the ActionResult compatibility
adapter and a local development signer.

- **Chain:** local Anvil devnet (chainId 31337)
- **Verifier mode:** `action-result-compat-v1/simulated-attestation` (format compatibility only)
- **Regenerate:** `bash evidence/run-positive-proof.sh` (Foundry + jq; no secrets, no live systems)

This run proves the settlement invariant on local Anvil. It does not prove TEE execution,
registration, attestation, or proxy delivery. The current FCE sender and extension handler
live in `contracts/src/JorqethInstructionSender.sol` and `fce-extension/`.

## Deployment

| Component | Address |
| --- | --- |
| Settlement | `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9` |
| Escrow token (mUSD) | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| ActionResult compatibility verifier | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` |
| Injected active-set adapter | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| Merchant (funder) | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Creator (payee) | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Local development signer | `0xC9fe5A864FbE024a2cc46d0dF6b2F5e2417204ca` |
| Extension id | `65536` |

## The successful path

1. Merchant funded escrow with 100.000000 mUSD (tx `0x19a353c9fa2ec31734423368819d1f961a57f9e456a8e8bba0d71dc76250ce7a`).
2. A local development signer signed an ELIGIBLE compatibility result for order
   `0xbe4b0fa03136646a52108527f8dd4873c60796d246fe5dd610ec0d4a2f6a1a45`.
3. `settle()` verified authenticity and released the exact commission
   (tx `0x0585c38b2aa088e8d6756b5d87cfc0f168a2f4043c0a3b670c147f38b548c9e6`, block 9, success, 139198 gas).

## Exact-amount agreement (every independent source equal)

| Source | Amount (mUSD, 6dp) |
| --- | --- |
| Configured formula `floor(200000000 × 1000 / 10000)` | 20000000 |
| Compatibility result `amount` field | 20000000 |
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
