# Jorqeth site

The public web app for **private commission settlement built on Flare**.

Jorqeth uses **Flare Confidential Compute** to evaluate a private merchant record, return a
signed TEE `ActionResult`, verify the active Flare TEE signer, and settle the exact creator
or affiliate commission on Coston2 without exposing the underlying ledger.

Built with Next.js 16, React 19, viem, and plain CSS. Fonts are self-hosted.

## Routes

| Route | What it shows |
| --- | --- |
| `/` | Flare-focused landing page and Coston2 proof. |
| `/how`, `/proof`, `/security`, `/faq` | Refresh-safe landing section routes. |
| `/app` | Primary Flare FCE settlement journey. |
| `/app/demo` | Separate disclosed-signer fallback test flow. |
| `/app/activity` | Committed settlement-path matrix. |
| `/app/receipt` | Reference settlement receipt. |
| `/app/inspector` | Reference verification checks and trust boundary. |
| `/docs` | Flare-native product flow, trust boundary, privacy, and troubleshooting. |
| `/terms`, `/privacy` | Legal and privacy details. |
| `/api/fce-result` | Server-side polling bridge for the Flare tee-proxy signed ActionResult. |
| `/api/evaluate` | Legacy disclosed-signer fallback evaluator used only by `/app/demo`. |

## Develop

```bash
npm ci
npm run dev
```

The site runs at `http://localhost:3000`.

## Configure the Flare Coston2 flow

Copy the values from the repository `.env.example` into `site/.env.local` or your host's
environment settings.

Public build variables:

- `NEXT_PUBLIC_COSTON2_RPC_URL`
- `NEXT_PUBLIC_JORQETH_TOKEN_ADDRESS`
- `NEXT_PUBLIC_JORQETH_VERIFIER_ADDRESS`
- `NEXT_PUBLIC_JORQETH_FACTORY_ADDRESS`
- `NEXT_PUBLIC_JORQETH_FCE_VERIFIER_ADDRESS`
- `NEXT_PUBLIC_JORQETH_FCE_FACTORY_ADDRESS`
- `NEXT_PUBLIC_JORQETH_FCE_INSTRUCTION_SENDER_ADDRESS`
- `NEXT_PUBLIC_JORQETH_FCE_EXTENSION_ID`

Primary FCE server-only variable:

- `JORQETH_FCE_PROXY_URL`

`JORQETH_FCE_PROXY_URL` must point to the public HTTPS Flare tee-proxy endpoint that
serves `GET /action/result/{instructionId}` for Jorqeth extension `66159`. The browser does
not receive this URL. `/api/fce-result` polls it server-side and returns the signed result.
The `/app` UI checks proxy readiness before it allows an FCE instruction to be sent.

Fallback demo server-only variables:

- `JORQETH_EVALUATOR_PRIVATE_KEY`
- `JORQETH_PRIVATE_RECORDS_JSON`

Those variables support only the separate `/app/demo` disclosed-signer flow. The private
key must match the public address registered in `SignatureResultVerifier`. Never prefix
server-only variables with `NEXT_PUBLIC_`.

## Flare trust path

```text
wallet
  -> Coston2 FCE campaign factory
  -> funded JorqethSettlement
  -> JorqethInstructionSender
  -> Flare FCE registry
  -> registered active TEE
  -> signed Flare ActionResult
  -> FccResultVerifier
  -> exact commission settlement on Coston2
```

The private merchant record remains inside the extension runtime. The public chain sees
only the minimum domain-bound result required to verify and settle the payout.

## Build and check

```bash
npm run typecheck
npm run build
```

The production build type-checks the API and client, prerenders the clean landing routes,
and leaves `/api/fce-result` and `/api/evaluate` as server routes.

## Trust boundary

The primary path is a real Flare FCE testnet integration. The committed proof uses Flare's
supported simulated-TEE mode and verifies the result signer against the current
MachineManager active set. Hardware-backed production attestation, confidential credential
delivery, a real commerce connector, and operational monitoring remain production
requirements.

The proof pages read their figures from `data/*.json`, mirrored from the repository's
committed Foundry evidence. They remain reference evidence and do not pretend to be the
connected wallet's live transaction history.

## License

MIT. See [`../LICENSE`](../LICENSE).
