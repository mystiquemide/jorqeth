# Jorqeth judge page

A single, read-only web page that replays Jorqeth's proven settlement behaviour for
a judge. It is a **lens over evidence**, not a live app: every number on the page is
read at load time from the committed Milestone 5 proof files, so the page can never
show a figure the proof does not contain.

- `evidence/positive-proof.json` — the eligible sale that pays the exact commission
- `evidence/negative-proof.json` — every other path (refund, replay, tampering,
  wrong-domain, untrusted signer, expiry, infrastructure-unknown, error-status,
  fleet-outage) and the one-line winning invariant

## What it shows

1. The winning invariant, read back from real state: across every attempted path
   against one funded campaign, exactly one moved value.
2. The funded campaign parameters and addresses.
3. The eligible sale: creator balance before and after, the exact commission, and
   the five independent amount sources that all equal the payout.
4. A matrix of every other path, each colour-toned by outcome so a legitimate
   "no commission owed" (terminal, pays zero) is visibly distinct from
   "we could not decide" (reverts, stays retryable) and from an attack (rejected).
5. Honest limitations and direct links to the underlying evidence files.

## Run it

Zero dependencies. Node 18+ only.

```bash
# from the repository root
node web/serve.mjs          # serves the repo root at http://127.0.0.1:8080
# then open http://127.0.0.1:8080/  (redirects to /web/index.html)
```

The server is read-only: GET/HEAD only, path-traversal blocked, no write endpoints.
It serves the repository root so the page can fetch `../evidence/*.json`.

## Reproduce the evidence

The page is only as trustworthy as the proof it reads. Regenerate that proof from a
clean chain and re-run the full gate with one command:

```bash
bash evidence/run-proof-gate.sh
```

That re-runs the Foundry suite, both on-chain proofs, and the privacy scan, then
rewrites `evidence/*.json`. Reload the page and the numbers move with it.

## Tests

```bash
node --test web/test/view.test.mjs   # 15 pure state tests over the real evidence
node web/smoke.mjs                    # headless-browser smoke: both scenarios,
                                      # 360px, keyboard focus, link readback,
                                      # rendered-DOM secret scan
```

The state tests import the same pure view-model the page uses and load the same
committed JSON the page fetches, so a green suite means the states you see are the
states that were proven.

## Honest disclosure

- **Replay, not live.** The page runs no chain call and triggers nothing. It is a
  faithful re-presentation of already-proven behaviour.
- **Synthetic data, testnet values only.** No real merchant or customer record is
  used or shown.
- **Local anvil, simulated attestation.** A fully live, production-attested Coston2
  round trip is externally blocked, so the verifier mode is labelled
  `simulated-attestation`. The TEE signature scheme itself is proven byte-for-byte
  against real Flare library code (`tools/tee-signer` +
  `contracts/test/FccRealSignature.t.sol`), which is the self-contained substitute
  for that blocked round trip.

## Design notes

- No framework, no build step, no bundler, no external asset. One HTML file, one
  stylesheet, two small ES modules, a static server, and a smoke test.
- Every value enters the DOM through `textContent`, never `innerHTML`, so the
  evidence JSON is treated as untrusted data with no markup-injection surface.
- Accessible by default: skip link, visible focus, semantic landmarks, reduced-motion
  support, light and dark themes, and no horizontal overflow down to 360px.
