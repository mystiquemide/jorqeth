# Coston2 FCE runtime

This stack runs the current Flare FCE lifecycle for Jorqeth on Coston2:

- Flare's official C-chain indexer in short-history FSP mode
- MySQL and Redis, isolated on the Compose network
- Flare's official `tee-proxy` v0.0.18
- Jorqeth's combined `tee-node` and commission extension

The registered instruction sender is `0x86bE7C32A5E566b105a224F94b3A2Ed3F751d097`
and its public extension ID is `66159` (`0x1026f`). The local runtime uses Flare's
documented simulated attestation mode for testnet. A production confidential-space
deployment must use `MODE=0` and a measured hardware attestation.

Start the runtime with:

```bash
docker compose --env-file .env up -d --build
```

The extension proxy listens on port `6674`. Give it a stable public HTTPS URL before
running the official allow-version, governance, and TEE registration commands.

The VPS-only files `.env`, `.env.mysql`, `.env.indexer`, `.env.proxy`, and `.env.tee`
hold the proxy key, database credentials, and private demo records. They are ignored
by Git and must never be committed. The TEE process generates a fresh in-memory
identity when it is recreated, so an intentional TEE restart requires the official
Flare registration and availability-proof flow again before it can accept production
instructions.
