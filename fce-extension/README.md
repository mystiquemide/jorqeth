# Jorqeth FCE extension

This service implements the current Flare Compute Extension HTTP lifecycle. A registered
TEE node forwards an instruction to `POST /action`. The handler decodes `DataFixed`,
matches `COMMISSION/EVALUATE`, reads the private merchant record inside the extension,
and returns only `abi.encode(PayableResult)` in the `ActionResult.data` field.

The instruction message contains public settlement bindings and an opaque order digest.
Set `JORQETH_PRIVATE_RECORDS` to a JSON array such as:

```json
[{"orderReference":"private-order-1","netAmount":"1000050","refunded":false}]
```

The raw reference is hashed during startup and never returned. Run the local handler tests
with `go test ./...`. A complete Coston2 round trip also needs Flare indexer access and the
official proxy and TEE services described in the Flare FCE scaffold.
