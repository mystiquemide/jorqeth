# Jorqeth QA CLI architecture

## Inspected application

Jorqeth is a multi-runtime repository:

- `site/` is a Next.js App Router application using React, TypeScript, and viem.
- `contracts/` contains Foundry Solidity contracts and tests.
- `fce-extension/` and `tools/tee-signer/` are Go modules.
- `web/` is a zero-dependency static evidence viewer with Node tests and optional Playwright smoke tests.
- `vercel.json` builds `site/` with the Next.js framework on Vercel.
- `deployments/coston2-live-demo.json` is the source evidence for the completed FXRP proof.

The primary user journey is `/app`: connect an injected EVM wallet, create an FXRP campaign, add
test FXRP, submit a private order reference through Flare Confidential Compute, verify the signed
result on Coston2, and pay the exact commission once. The CLI does not automate wallet signing or
funding. Those actions would require a test account and an explicit isolated write strategy.

The legacy `/app/demo` route uses the historical mUSD FCE deployment. It is kept separate from the
primary FXRP journey.

## Runtime configuration

The public and server-only variables are declared in `.env.example`. The CLI checks variable names,
required template coverage, and tracked secret patterns without printing values. The server-only
`JORQETH_FCE_PROXY_URL` is checked indirectly through `/api/fce-result?health=1` on the deployment.

## Command mapping

| Command | Real checks |
| --- | --- |
| `doctor` | Required files, Node/npm, installed site binaries, Foundry/Go availability, browser harness availability. |
| `config check` | `.env.example` coverage, source env references, local env presence, tracked secret patterns. |
| `test` | Existing Node state tests, site typecheck and build, plus optional Foundry, Go, and browser checks. |
| `health` | All declared live routes, required public assets, security headers, FCE readiness, invalid input handling. |
| `deploy check` | Health checks plus static proof consistency and read-only Coston2 transaction receipt verification. |
| `flow run primary` | Signed-out primary app markers and FCE readiness. |
| `qa` | Config, source drift, available tests, deployment health, primary flow, and proof checks. |
| `qa --full` | Standard QA plus Foundry, Go, and Playwright checks when those toolchains are installed. |

## Evidence model

Every check returns a stable status, duration, evidence object, failure reason, and suggested fix.
The report schema is versioned in `scripts/jorqeth-qa.mjs`. Output is written under
`artifacts/qa/` as JSON, Markdown, JUnit XML, and per-command logs. Secrets are masked before being
written to those files.

All network checks are read-only. The CLI does not deploy, merge, push, create campaigns, fund
escrow, submit FCE instructions, settle payments, or mutate production data.
