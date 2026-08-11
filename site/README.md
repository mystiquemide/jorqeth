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
| `/api/evaluate` | Server-side testnet evaluation and result signing. |

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

- `JORQETH_EVALUATOR_PRIVATE_KEY`
- `JORQETH_PRIVATE_RECORDS_JSON`

The private key must match the public address registered in
`SignatureResultVerifier`. Never prefix server-only variables with `NEXT_PUBLIC_`.

`JORQETH_PRIVATE_RECORDS_JSON` is an array of private testnet records. Amounts use the
six-decimal mUSD base unit.

```json
[
  { "reference": "merchant-order-001", "class": "eligible", "netAmount": "200000000" },
  { "reference": "merchant-order-002", "class": "refunded", "netAmount": "0" }
]
```

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
campaign factory. Copy the three printed addresses into the matching public site
variables. The evaluator signer address supplied to the deploy script must correspond to
the server-only evaluator private key.

The deployer wallet needs C2FLR for gas. The app also requires connected wallets to hold
C2FLR for campaign, funding, and settlement transactions.

## Build and check

```bash
npm run build
npm run start
```

The production build type-checks the API and client, prerenders the clean landing routes,
and leaves `/api/evaluate` as a server route.

## Trust boundary

Campaign creation, escrow funding, settlement, balances, and replay protection run on
Coston2. The committed FCE proof uses Flare's supported simulated-TEE testnet mode and the
current MachineManager active set. Hardware-backed production attestation, confidential
credential delivery, and a real commerce connector remain production requirements. The
interactive demo route remains available as a separate disclosed-signer test path.

The proof pages read their figures from `data/*.json`, mirrored from the repository's
committed Foundry evidence. They remain reference evidence and do not pretend to be the
connected wallet's live transaction history.

## License

MIT. See [`../LICENSE`](../LICENSE).
