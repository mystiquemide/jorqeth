# Coston2 FCE runtime

This stack runs Jorqeth's Flare Confidential Compute lifecycle on Coston2:

- MySQL for the local Flare C-chain indexer
- Flare C-chain indexer in short-history FSP mode
- Redis for tee-proxy queues
- Flare `tee-proxy` v0.0.18
- Jorqeth's combined TEE node and commission extension

All services use `restart: unless-stopped`. MySQL, Redis, the TEE control ports, and the
proxy's internal port are not published. Both proxy ports bind to host loopback; the external
result API is exposed through an HTTPS tunnel or reverse proxy rather than by opening port 6674
directly to the internet.

The registered instruction sender is `0x86bE7C32A5E566b105a224F94b3A2Ed3F751d097`
and the extension ID is `66159` (`0x1026f`). The current Coston2 runtime uses Flare's
simulated-TEE testnet mode. This is not hardware-backed production attestation.

## Runtime secrets

Tracked files are credential-free templates. Do not commit database passwords, proxy signing
keys, deployer keys, or private merchant records.

Create the ignored runtime files:

```bash
cp .env.example .env
cp proxy.toml proxy.runtime.toml
```

Fill `.env` with strong local values for:

- `MYSQL_ROOT_PASSWORD`
- `INDEXER_DB_PASSWORD`
- `FCE_PROXY_PRIVATE_KEY`
- `JORQETH_PRIVATE_RECORDS`

Then put the same `INDEXER_DB_PASSWORD` value in the `[db]` section of the ignored
`proxy.runtime.toml`. The indexer itself receives its database password through `DB_PASSWORD`.

## Start

```bash
docker compose --env-file .env up -d --build
docker compose --env-file .env ps
```

Verify the external proxy locally:

```bash
curl -fsS http://127.0.0.1:6674/info
```

The public web application needs an HTTPS route to that external proxy. The current hosted Jorqeth
runtime uses:

```text
https://jorqeth-fce.breachresponse.xyz
```

The site keeps that endpoint server-only through `JORQETH_FCE_PROXY_URL`; the browser talks only
to `/api/fce-result` on the Jorqeth web deployment.

## Current hosted proof

A completed hosted run is summarized in
[`../../deployments/coston2-live-demo.json`](../../deployments/coston2-live-demo.json). It records
the FCE instruction, active TEE signer, 20 mUSD payout, 80 mUSD remaining escrow, final settlement
transaction, and rejected replay.

## Recovery

Routine restart:

```bash
docker compose --env-file .env up -d
curl -fsS http://127.0.0.1:6674/info
```

If MySQL was restarted separately, restart the indexer after MySQL becomes healthy:

```bash
docker compose --env-file .env restart indexer
```

The current simulated TEE identity is ephemeral. Recreating the TEE container generates a new
identity, so the official Flare registration and promotion flow must be run again before the new
TEE can serve verified results.
