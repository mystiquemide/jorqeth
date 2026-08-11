# ActionResult compatibility vector

This tool checks that Jorqeth encodes `PayableResult` and reconstructs the Flare
`ActionResult` signing hash with the pinned `tee-node` and `go-flare-common` libraries.
It signs with a public local Anvil development key and writes `genuine-vector.json`, a
legacy filename retained because the Solidity fixture imports it.

This proves byte-format compatibility only. It does not prove execution inside a TEE,
machine registration, hardware attestation, proxy delivery, or a live FCE round trip.

```bash
go run .
go test ./...
go vet ./...
```

The resulting fixture is checked by `contracts/test/FccRealSignature.t.sol`. That test
name is also retained for compatibility with the existing proof scripts.
