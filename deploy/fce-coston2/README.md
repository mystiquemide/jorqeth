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

The indexer configuration keeps the official FSP collectors and also collects
`FlareSystemsManager.signNewSigningPolicy` transactions. `tee-proxy` v0.0.18 uses those
transactions to assemble signing-policy votes during an epoch rollover. Keep the indexer on the
official Coston2 RPC, use one confirmation for this testnet runtime, and preserve the MySQL
volume during recovery. If a short-history database is missing a policy event required by the
proxy, restore only the verified on-chain event row. Do not drop the database or recreate the TEE
as part of an indexer repair.

## Runtime secrets

Tracked files are credential-free templates. Do not commit database passwords, proxy signing
keys, deployer keys, or private merchant records.

Create the ignored runtime files from the credential-free template:

```bash
cp .env.example .env
cp .env.example .env.mysql
cp .env.example .env.indexer
cp .env.example .env.proxy
cp .env.example .env.tee
```

Put each value in the matching file section:

- `.env`: `FCE_PROXY_PRIVATE_KEY` and, optionally, `COSTON2_RPC_URL`
- `.env.mysql`: `MYSQL_ROOT_PASSWORD` and `DB_PASSWORD`
- `.env.indexer`: the same `DB_PASSWORD`
- `.env.proxy`: the same database password as `FCE_MYSQL_PASSWORD`
- `.env.tee`: `JORQETH_PRIVATE_RECORDS`

The indexer receives its database password through `.env.indexer`. The proxy entrypoint inserts
`FCE_MYSQL_PASSWORD` into the generated runtime config. The template files may contain unrelated
blank variables after copying, but only the matching values are read by Compose.

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
the FCE instruction, active TEE signer, 3 FTestXRP payout, 5 FTestXRP remaining escrow, final
settlement transaction, and rejected replay.

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
