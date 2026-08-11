# Jorqeth site

The product website and interactive dashboard for Jorqeth: private, exact
creator-affiliate commission settlement on Flare Confidential Compute. Every figure on
these pages is read from the committed on-chain proof in [`../evidence`](../evidence), not
from hand-written copy.

This is the marketing landing page plus the guided settlement dashboard. For the
standalone, dependency-free verification viewer (a single static page that replays the
same committed evidence with no build step), see [`../web`](../web) instead.

Built with Next.js 16 (App Router), React 19, and plain CSS. No Tailwind, no UI kit.
Fonts are self-hosted (`public/fonts`), so there is no CDN dependency.

## Routes

| Route | What it shows |
| --- | --- |
| `/` | Landing: what Jorqeth settles and why the number is trustworthy. |
| `/app` | Settlement dashboard: the one eligible payout, escrow left intact, verification suite. |
| `/app/activity` | The full 12-path settlement matrix, one outcome each. |
| `/app/receipt` | The receipt for the single sale that released the exact commission. |
| `/app/inspector` | The verification walk: five independent sources agreeing to the cent. |

`/app` is the canonical page to open first when reviewing the proof.

## Develop

```bash
npm ci
npm run dev        # http://localhost:3000
```

## Build and check

```bash
npx tsc --noEmit   # typecheck
npm run build      # production build
npm run start      # serve the build
```

## Evidence, not copy

The pages import their numbers from `data/*.json`, a byte-identical mirror of the
repository's committed proof:

- `data/positive-proof.json`, `data/negative-proof.json`, `data/proof-gate.json` mirror
  `../evidence/*.json`.
- `data/jorqeth-v1.json` mirrors the frozen spec at `../spec/jorqeth-v1.json`.

CI fails if any mirror drifts (`cmp` in `../.github/workflows/ci.yml`). To refresh after
a new proof run, copy the regenerated files from `../evidence` and `../spec` over the
matching files in `data/`, then rerun the build.

## Deploy

Any Node host that runs `npm ci && npm run build && npm run start` serves the site. It is
a standard Next.js app with no environment variables and no server-side data source, so a
static-friendly host works too.

## Honest status

Testnet and synthetic data only. The proofs run on a local anvil chain (chainId 31337)
with a synthetic escrow token and records. The settlement invariant and the Flare
signature scheme are real; a fully live production attestation round trip is the one
remaining piece. The pages say so where it matters, and the copy is not allowed to claim
more than the linked proof supports.

## License

MIT. See [`../LICENSE`](../LICENSE).
