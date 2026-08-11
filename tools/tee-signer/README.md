# tee-signer - Flare ActionResult signature compatibility vector

This helper generates a deterministic Jorqeth `PayableResult` signature using the same public hashing and signing primitives imported from pinned Flare libraries.

It proves a narrow, useful statement: Jorqeth's Solidity reconstruction of the pinned Flare `ActionResult` signature format agrees with those library functions for the committed test vector.

It does **not** prove that a Flare TEE executed Jorqeth, that a TEE was registered on Coston2, or that production attestation occurred.

## Pinned primitives

| Step | Function | Package |
| --- | --- | --- |
| ABI encode the result | `abi.Arguments.Pack` | go-ethereum v1.17.4 |
| Hash the result envelope | `teetypes.ActionResult.Hash()` | tee-node v0.0.24 |
| Build the signing payload | `csigning.NewPayload(...).Hash()` | go-flare-common 09a10067e6a4 |
| EIP-191 secp256k1 signing | `teeutils.Sign(...)` | tee-node v0.0.24 |

The helper mirrors the public primitives used by the pinned `tee-node` signing path. The driver itself runs locally and signs with the well-known public Anvil account-0 key.

## Run

```bash
gofmt -d .
go test ./...
go vet ./...
go run .
```

Go `1.25.1` is declared in `go.mod`.

The command prints the result fields, intermediate hashes, signer address, and signatures with `v` in both `{0,1}` and `{27,28}` forms. The committed vector is consumed by `contracts/test/FccRealSignature.t.sol`.

## What the Solidity test checks

`FccRealSignature.t.sol` verifies that:

- Solidity `abi.encode(result)` matches the Go-produced bytes.
- The reconstructed `ActionResult` hash and signing payload match the helper output.
- The normalized signature recovers the expected local test signer.
- A wrong chain id fails.
- A tampered amount fails.
- A signer outside the deterministic local signer set fails.

## Current FCC integration gap

The current official FCE scaffold selects machines with `TeeMachineRegistry.getRandomTeeIds(extensionId, count)` and sends instructions through `TeeExtensionRegistry`. Jorqeth's `FccResultVerifier` currently uses a deterministic local signer-set adapter for membership testing, which is not the current Coston2 registry ABI.

Closing the gap requires implementing the current official FCE instruction lifecycle and binding the selected/registered TEE result to settlement. This helper should remain a compatibility regression test after that integration exists.
