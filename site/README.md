# Jorqeth site

The public landing page, interactive Coston2 settlement flow, and committed proof viewer
for Jorqeth.

Built with Next.js 16, React 19, viem, and plain CSS. Fonts are self-hosted.

The source includes the interactive Coston2 settlement journey, local invariant evidence,
and a complete Coston2 FCE proof. The proof selects an active TEE, evaluates the private
record in the extension, verifies the raw signed ActionResult, and releases escrow once.

| Route | What it shows |
| --- | --- |
| `/` | Landing page. |
| `/how`, `/proof`, `/security`, `/faq` | Refresh-safe landing section routes. |
| `/app` | Eight-step Coston2 commission settlement flow. |
| `/app/activity` | Committed 12-path settlement matrix. |
| `/app/receipt` | Reference settlement receipt. |
| `/app/inspector` | Reference verification checks and trust boundary. |
| `/docs` | Product flow, current trust boundary, privacy, and troubleshooting. |
| `/terms`, `/privacy` | Legal and privacy details. |
| `/api/fce-result` | Server-only bridge to the public FCE result proxy and signed-result decoder. |

## Develop

```bash
npm ci
npm run dev
```

The site runs at `http://localhost:3000`.

## Configure the Coston2 flow

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

Server-only variables:

- `JORQETH_FCE_PROXY_URL`

`JORQETH_FCE_PROXY_URL` points to the HTTPS result endpoint for the running Flare FCE
stack. Never prefix server-only variables with `NEXT_PUBLIC_`.

## Deploy the contracts

From the repository root:

```bash
cp .env.example .env
source .env
forge script script/Deploy.s.sol:Deploy \
  --rpc-url coston2 \
  --broadcast \
  --verify
```

The script deploys the open-faucet test mUSD token, testnet signature verifier, and
campaign factory. The live interactive path uses the separately deployed FCE factory,
instruction sender, and ActionResult verifier listed in the root deployment manifest.

The deployer wallet needs C2FLR for gas. The app also requires connected wallets to hold
C2FLR for campaign, funding, and settlement transactions.

## Build and check

```bash
npm run build
npm run start
```

The production build type-checks the API and client, prerenders the clean landing routes,
and leaves `/api/fce-result` as a server route.

## Trust boundary

Campaign creation, escrow funding, FCE instruction dispatch, signed-result verification,
settlement, balances, and replay protection run on Coston2. The live stack uses Flare's
supported simulated-TEE testnet mode and the current MachineManager active set.
Hardware-backed production attestation, confidential credential delivery, and a real
commerce connector remain production requirements.

The proof pages read their figures from `data/*.json`, mirrored from the repository's
committed Foundry evidence. They remain reference evidence and do not pretend to be the
connected wallet's live transaction history.

## License

MIT. See [`../LICENSE`](../LICENSE).
