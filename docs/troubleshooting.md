# Jorqeth QA troubleshooting

## Site dependencies are skipped

Run the install from the site directory:

```bash
cd site
npm ci
cd ..
npm run qa
```

The CLI does not install dependencies automatically because an install can hide a broken lockfile
or change the environment being diagnosed.

## Foundry or Go checks are skipped

Install the missing toolchain and rerun `npm run qa:full`. GitHub Actions remains the authoritative
remote check for these modules when local toolchains are unavailable.

## FCE health fails

The deployment boundary must return:

```json
{"configured":true,"ready":true}
```

Check the server-only `JORQETH_FCE_PROXY_URL`, the proxy `/info` endpoint, and the Vercel deployment
environment. Never expose the proxy URL to a `NEXT_PUBLIC_` variable.

## Proof receipts fail

The proof check uses the RPC in `COSTON2_RPC_URL`, or the public Coston2 RPC default. Inspect the
transaction hashes in `deployments/coston2-live-demo.json` and confirm that the receipt is successful,
the settlement targets the tracked campaign, and the FXRP transfer matches the committed amount.

## Source drift fails

Source drift is a deliberate release blocker. It catches stale docs such as a primary FXRP journey
that still says mUSD, a route table that lists a removed API route, or a legacy FCE fallback described
as a disclosed-signer flow. Update the source and documentation together, then rerun `npm run qa`.

## Browser smoke is skipped

The existing `web/smoke.mjs` and `web/smoke-surfaces.mjs` scripts resolve Playwright globally and
expect a Chromium binary. Install both, set `PLAYWRIGHT_CHROMIUM` or `CHROME_PATH` if needed, then
run `npm run qa:full`.
