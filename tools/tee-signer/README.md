# tee-signer — genuine Flare TEE-node signature over a Jorqeth result

This tool mints a **real** Flare Confidential Compute (FCC) TEE-node signature over a
Jorqeth `PayableResult` and proves the on-chain `FccResultVerifier` accepts it with
**zero changes** to `JorqethSettlement`.

It is the strongest FCC round-trip evidence achievable without provisioning Flare's
private e2e devnet (Hardhat + indexer DB + FTDC proxy + the `FlareTeeManager` diamond),
none of which is self-provisionable inside a hackathon window. Instead of faking a
signature, every cryptographic step here runs the **actual pinned Flare library code**.

## What it reproduces

`internal/router.SignResult` in `tee-node@v0.0.24` is, in full:

```go
signHash, _ := csigning.NewPayload(csigning.TEEActionResult, chainID, common.BytesToHash(ar.Hash())).Hash()
sig, _       := signer.Sign(signHash[:])   // Node.Sign == teeutils.Sign(hash, key)
```

`router` and `node` live under `internal/`, so they cannot be imported across modules.
But the three primitives they call are **public**, and this driver calls those exact
functions:

| Step | Genuine function | Package (pinned) |
| --- | --- | --- |
| `Data = abi.encode(PayableResult)` | `abi.Arguments.Pack` | go-ethereum v1.17.4 |
| `arHash = keccak256(keccak256(Data)‖id‖keccak256(tag)‖status)` | `teetypes.ActionResult.Hash()` | tee-node v0.0.24 |
| `payload = keccak256(abi.encode("TEE_ACTION_RESULT", chainId, arHash))` | `csigning.NewPayload(...).Hash()` | go-flare-common 09a10067e6a4 |
| `digest = EIP-191(payload); sig = secp256k1_sign(digest)` | `teeutils.Sign(...)` | tee-node v0.0.24 |

So the emitted signature is byte-for-byte what a live Flare tee-node would produce for
the same result on chain `31337`.

## Run

```bash
go run .        # requires the Go 1.25 toolchain (auto-fetched via GOTOOLCHAIN)
```

Output is `genuine-vector.json` (committed): the result fields, the intermediate
hashes, the signer (`teeId`), and the signature in both forms.

## Two landmines this proof exposes (a mock `vm.sign` hides both)

1. **v-byte.** go-ethereum `crypto.Sign` emits `v ∈ {0,1}`; OpenZeppelin `ECDSA` needs
   `{27,28}`. The on-chain relayer applies the standard `+27` (r, s untouched). The
   vector ships both `signatureRaw_v01` and `signature_v2728`.
2. **chainId binding.** The signature is bound to the signer's configured `CHAIN_ID`
   (`31337` here). It verifies only on a chain whose id matches.

## Where it's asserted on-chain

`contracts/test/FccRealSignature.t.sol` hardcodes this vector and proves:

- Solidity `abi.encode(result)` equals the Go-produced `Data` byte-for-byte
- the reconstructed `arHash` / `payload` equal the genuine captured hashes
- `FccResultVerifier.verify(result, proof)` **accepts** the genuine signature
- raw `v01` is rejected until normalized; a wrong chainId is rejected; a tampered
  amount is rejected; acceptance requires recovering the registered `teeId`

Regenerating the vector and updating those constants keeps the proof honest end to end.
