# Jorqeth QA coverage

## Standard QA

`npm run qa` covers:

1. Environment template and tracked-secret checks.
2. Source drift checks for documented routes, primary FXRP copy, and the legacy fallback label.
3. Existing Node unit tests.
4. Next.js typecheck and production build when site dependencies are installed.
5. Live route and asset availability for the current deployment.
6. FCE readiness and invalid instruction ID handling.
7. Signed-out primary payment flow markers.
8. Static proof consistency and read-only Coston2 receipt verification.

## Full QA

`npm run qa:full` adds the contract format/build/tests, both Go module test and vet suites, and the
existing browser replay smoke tests when Foundry, Go, Playwright, and Chromium are available. A
missing optional toolchain is reported as `SKIP` with a fix suggestion. It is never silently treated
as a pass.

## Product-flow boundary

The CLI verifies the signed-out primary flow and the readiness boundary. It does not connect a
wallet, request a signature, create a campaign, approve tokens, fund escrow, submit an FCE request,
or settle a payment. Those are state-changing operations and require a disposable test wallet,
isolated funds, cleanup, and explicit authorization.

## Deployment proof

The deployment check reads the chain ID, instruction transaction, settlement transaction, transaction
receipts, and FXRP `Transfer` log for the committed live proof. It checks that:

- Coston2 chain ID is `114`.
- The instruction transaction succeeded and targeted the tracked instruction sender.
- The settlement transaction succeeded and targeted the tracked campaign.
- The payout transfer came from the campaign, reached the tracked creator, and matched the committed
  base-unit amount.

The check does not trust a page screenshot or a hardcoded success label.
