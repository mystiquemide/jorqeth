# Jorqeth FCE extension

This service embeds Flare's current `tee-node` and implements the Compute Extension HTTP
lifecycle with the official `Action`, `DataFixed`, and `ActionResult` types. The TEE node
forwards a selected instruction to `POST /action`. The handler decodes `DataFixed`,
matches `COMMISSION/EVALUATE`, reads the private merchant record inside the extension,
and returns only `abi.encode(PayableResult)` in the `ActionResult.data` field.

The instruction message contains public settlement bindings and an opaque order digest.
Set `JORQETH_PRIVATE_RECORDS` to a JSON array such as:

```json
[{"orderReference":"private-order-1","netAmount":"1000050","refunded":false}]
```

The raw reference is hashed during startup and never returned. Run the tests with
`go test ./...`. The included Dockerfile builds the combined extension and TEE node image.
