# Jorqeth site

The public web app for **private commission settlement powered by Flare Confidential Compute**.

Jorqeth privately checks an agreed merchant record, calculates the exact creator or affiliate
commission, and settles it on Flare Coston2 without exposing the underlying ledger.

Built with Next.js 16, React 19, viem, and plain CSS. Fonts are self-hosted.

## Routes

| Route | What it shows |
| --- | --- |
| `/` | Product-first Flare landing page. |
| `/proof` | Dedicated live hosted FCE instruction and settlement proof. |
| `/how`, `/security`, `/faq` | Refresh-safe landing section routes. |
| `/app` | Primary Flare Confidential Compute settlement journey. |
| `/app/demo` | Separate disclosed-signer fallback test flow. |
| `/app/activity` | Deterministic settlement-path matrix. |
| `/app/receipt` | Reference settlement receipt. |
| `/app/inspector` | Reference verification checks and trust boundary. |
| `/docs` | Product flow, Flare trust path, privacy boundary, and troubleshooting. |
| `/terms`, `/privacy` | Legal and privacy details. |
| `/api/fce-result` | Server-side result bridge and readiness check for the FCE runtime. |
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

The production Vercel project has this server-only variable configured for the hosted FCE result
bridge. It must point to the public HTTPS tee-proxy endpoint that serves `/info` and
`GET /action/result/{instructionId}` for Jorqeth extension `66159`. The browser never receives the
proxy URL.

`GET /api/fce-result?health=1` performs an actual `/info` readiness check through the server. A
healthy runtime returns:

```json
{"configured":true,"ready":true}
```

Fallback demo server-only variables:

- `JORQETH_EVALUATOR_PRIVATE_KEY`
- `JORQETH_PRIVATE_RECORDS_JSON`

Those variables support only the separate `/app/demo` disclosed-signer flow. Never prefix
server-only variables with `NEXT_PUBLIC_`.

## Flare trust path

```text
wallet
  -> Coston2 FCE campaign factory
  -> funded JorqethSettlement
  -> JorqethInstructionSender
  -> Flare Confidential Compute
  -> registered active TEE
  -> signed Flare ActionResult
  -> FccResultVerifier
  -> exact commission settlement on Coston2
```

The private merchant record remains inside the evaluation runtime. The public chain sees only the
minimum domain-bound result required to verify and settle the payout.

## Live proof

The dedicated `/proof` route uses `lib/live-proof.ts`, which mirrors the hosted Coston2 run recorded
in `../deployments/coston2-live-demo.json`:

- FCE instruction: `0x8142d704...`
- Settlement: `0xf8269c7a...`
- Exact commission: `3 FTestXRP`
- Remaining escrow: `5 FTestXRP`
- Replay: rejected

The older deterministic proof pages remain useful for negative-path and settlement-invariant
inspection; they are separate from the live hosted transaction proof.

## Build and check

```bash
npm run typecheck
npm run build
```

## Trust boundary

The primary path is a real Flare FCE testnet integration. The current hosted runtime uses Flare's
supported simulated-TEE mode and verifies the result signer against the active TEE set. This is not
hardware-backed production attestation. Confidential credential delivery, a real commerce
connector, measured production attestation, and operational monitoring remain production
requirements.

## License

MIT. See [`../LICENSE`](../LICENSE).
