# Changes implemented from CODE_REVIEW.md

Date: 2026-08-11
Source: `CODE_REVIEW.md` (findings REV-001 to REV-008 plus the Hallmark UI audit), then a
follow-up re-review that reopened REV-003, REV-004, and the Hallmark marquee as partial.
Scope of this pass: implement every finding that is fixable in code, verify each with a real check, and record the rest as blocked with the reason.

Two rounds are recorded here. The first pass was committed as `ea6ccd2` ("Implement code
review fixes and Hallmark UI pass"). The re-review round (see "Re-review round" below) sits
in the working tree, uncommitted, awaiting review. Nothing was pushed or deployed.

## Status at a glance

| Finding | Severity | State | Where |
|---|---|---|---|
| REV-001 FCE path never executes | HIGH | Blocked (needs sponsor scaffold + scope call) | contracts / tools |
| REV-002 Repo and live app unreachable | HIGH | Blocked (ops: publish, DNS, deploy, video) | ops |
| REV-003 Merchant can drain escrow pre-settlement | HIGH | Done | `contracts/src/JorqethSettlement.sol` |
| REV-004 Public copy overstates what is live | MEDIUM | Done | site copy, README, tee-signer |
| REV-005 4-column inline grid clips at 360px | MEDIUM | Done | `site/app/globals.css`, app pages |
| REV-006 Smoke can pass after its server dies | MEDIUM | Done | `web/smoke*.mjs`, `web/serve.mjs` |
| REV-007 Packaging does not match the product | MEDIUM | Done (repo files); About metadata blocked (ops) | `LICENSE`, CI, READMEs |
| REV-008 No browser security headers | LOW | Done | `site/next.config.ts` |
| Hallmark: color tokens | Major | Done | `site/app/globals.css` + markup |
| Hallmark: page-wide scroll reveal | Major | Done | `site/components/Reveal.tsx` |
| Hallmark: marquee has no keyboard pause | Major | Done | `site/components/ProofStrip.tsx` |
| Hallmark: eyebrow on every section | Major | Done | `site/app/page.tsx` |
| Hallmark: pure black/white surface | Critical | Done | `site/app/globals.css` |
| Hallmark: AI footer | Critical | Done | `site/components/SiteFooter.tsx` |
| Hallmark: AI nav shape | Critical | Not done (open-ended redesign) | see below |
| Hallmark: 3-column feature grid | Critical | Not done (open-ended redesign) | see below |
| Hallmark: uniform section padding | Minor | Not done (subjective spacing) | see below |

## What changed, finding by finding

### REV-003 (HIGH) Merchant could revoke prefunded escrow before settlement

The merchant funded escrow but could withdraw all of it before a valid in-window result settled, so a creator with a legitimate payout could be starved.

Fix in `contracts/src/JorqethSettlement.sol`:
- Added an immutable `campaignEnd` set at construction, required to be in the future.
- `withdrawEscrow` now reverts `EscrowLocked(campaignEnd, now)` while `block.timestamp < campaignEnd`. Escrow is only withdrawable once the campaign window closes, so a valid result can always settle first.
- `settle` now also rejects any result whose `expiry` exceeds `campaignEnd`, reverting `ExpiryAfterCampaignEnd(expiry, campaignEnd)`. Combined with the existing `expiry > now` check, every settleable result satisfies `now < expiry <= campaignEnd`, so the settlement window and the withdrawal window (`now >= campaignEnd`) are provably disjoint. A merchant withdrawal at `campaignEnd` can no longer strand a valid result. This turns the earlier off-chain "set campaignEnd beyond every expiry" convention into an enforced on-chain invariant, which is the liability reservation the re-review asked for.

Tests added in `contracts/test/SettlementInvariants.t.sol`:
- `test_withdrawEscrow_lockedBeforeCampaignEnd`
- `test_withdrawEscrow_atBoundaryUnlocks`
- `test_validResultSettlesWhileEscrowLocked`
- `test_settle_rejectsExpiryAfterCampaignEnd` (expiry past `campaignEnd` reverts)
- `test_settle_allowsExpiryAtCampaignEnd` (inclusive boundary still pays exact)
- `test_withdrawAtCampaignEnd_cannotStrandResult` (withdraw all at end, no result can settle at or after it)

### REV-004 (MEDIUM) Public copy overstated what is live, private, and proven

Landing and app copy implied a live production attestation round trip that does not exist yet, and leaned on "private" without the caveat that the current run is local replay with a simulated attestation on synthetic records.

Fix:
- Landing hero note now states plainly: local replay, simulated attestation, synthetic records, with the live attestation round trip called out as the one remaining piece (`site/app/page.tsx`).
- FAQ and app layout copy aligned to the same honest framing (`site/components/Faq.tsx`, `site/app/app/layout.tsx`).
- README and `site/README.md` updated to match.
- `tools/tee-signer/main.go` wording aligned so the signer describes simulated attestation rather than a live TEE.

### REV-005 (MEDIUM) Four-column inline grid clipped the dashboard at 360px

Both dashboard pages set `gridTemplateColumns: repeat(4, 1fr)` inline, overriding the responsive rule. At 360px the third and fourth cards ran off-screen with no scroll container.

Fix:
- Removed the inline column declarations and moved to a `.grid-4` class in `site/app/globals.css`.
- `.grid-4` is four-up on wide screens, two-up at `<=620px`, one-up at `<=360px`, so cards step down instead of clipping.
- The web smoke asserts every card rectangle stays inside the viewport at 360px (see REV-006).

### REV-006 (MEDIUM) The browser smoke could report success after its server failed

The smoke started a static server without confirming it was serving this checkout, so a dead or wrong server could still let the run print a pass.

Fix:
- Added `web/smoke-server.mjs`: starts the static server on a free port and confirms it is this checkout before returning a base URL.
- `web/smoke.mjs` and `web/smoke-surfaces.mjs` now use it, and both fail loudly if the server is not the expected one.
- `web/serve.mjs` hardened alongside.
- Both smokes now cover 360px layout, keyboard reachability, link readback, and a secret scan.

### REV-007 (MEDIUM) Repository packaging did not match the product

Fix (repo files):
- Added a real `LICENSE`.
- Added CI at `.github/workflows/ci.yml` that runs the contract tests, the byte-identical data mirror check, and the web smokes.
- Rewrote `site/README.md` to describe the actual product and how to run it.

Still open (ops, needs repo settings access): the GitHub About blurb, topics, and homepage link. Flagged, not code.

### REV-008 (LOW) No browser security headers

`site/next.config.ts` was an empty scaffold, so the deployment sent no security headers.

Fix in `site/next.config.ts`:
- Added `async headers()` applying to every route: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy` that denies camera, microphone, and geolocation, and a `Content-Security-Policy`.
- CSP is `default-src 'self'`, `img-src 'self' data:`, `style-src 'self' 'unsafe-inline'`, `script-src 'self' 'unsafe-inline'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`.
- `'unsafe-inline'` is required because the only inline script is Next.js's RSC payload and styling uses inline `style=""` attributes. A nonce CSP was rejected on purpose: it forces every static route to render dynamically, which is a heavy cost for a read-only site and a LOW finding.
- Verified the build stays fully static, all five routes plus the 404 carry the headers, and a real chromium load reports zero CSP violations.

## Hallmark UI audit

The Hallmark audit flagged 4 critical, 4 major, 1 minor. I implemented every item that is a concrete fix and left the open-ended redesigns, which Hallmark itself declined to make, for a deliberate design pass.

### Done

- Color tokens (Major "mid-render token improvisation" + Critical "pure black, pure white"). Every raw hex and rgba in markup and component CSS now routes through a semantic token or `currentColor`. `--surface` is a warm near-white (`#FEFCF9`) instead of pure `#FFFFFF`, and the stray `#fff` hover was tokenized. SVG check icons on the landing and receipt pages use `currentColor` driven by a color token on their container. The only raw values left are the metadata `themeColor` literal, which Next requires as a literal, and rgba inside shadow token definitions.
- First-load entrance instead of page-wide scroll reveal (Major). `site/components/Reveal.tsx` no longer uses an IntersectionObserver. The server renders children fully visible, and after mount only elements already in the first viewport play a short fade-up. Anything below the fold stays visible and is never hidden, so a full-page automated screenshot captures every section instead of blank bands.
- Keyboard-pausable proof strip (Major). Extracted the marquee into `site/components/ProofStrip.tsx`, a client component with a real focusable `<button>` carrying `aria-pressed`. Pressing it toggles `.is-paused`, which stops the animation. Under `prefers-reduced-motion` the track is static. Hover-pause stays as a secondary path.
- Eyebrow trim (Major). Cut the decorative eyebrows from the hero, problem, security, and FAQ sections. Kept only the two that mark a real sequence or proof state: "How it works" above the numbered steps and "Proven" above the on-chain figures.
- Proof-close footer (Critical "AI footer"). Replaced the four-column SaaS link grid in `site/components/SiteFooter.tsx` with a single close: one proof statement, the repository link plus the two key proof destinations, the test-mode disclosure, and copyright. CSS updated to match.

### Not done, and why

These three are redesigns, not fixes. Hallmark stated it did not edit or redesign the site, and the review gives only direction, not a target. Doing them unprompted would be a large subjective design change rather than closing a defect.

- AI nav shape (Critical). "Use a product-specific navigation shape" has no defined target. The current nav is accessible and works. This needs a design decision.
- Three-column feature grid (Critical). "Collapse into one compact process diagram or an asymmetric sequence" is a from-scratch layout. The current steps render correctly and are responsive after REV-005.
- Uniform section padding (Minor). Tightening proof sections versus narrative sections is a spacing-rhythm judgment call, better made against a live visual pass.

If you want any of these three, say the word and I will treat it as its own design task.

## Blocked, needs your call or an ops action

### REV-001 (HIGH) The sponsor FCE path never executes a real evaluation

The proof gate labels the FCC path real and load-bearing based on signature compatibility and registry tests, without running an extension or a merchant-record evaluation against a live attestation. Closing this needs two things I do not have or should not decide alone:
- Access to the Flare sponsor scaffold to run a real FCE round trip.
- A scope decision: build the real round trip now, or cut the claim and describe the path as simulated until it exists.

The code-side honest-claim narrowing is already done under REV-004, so the site no longer overstates this. The remaining work is the actual round trip or an explicit scope cut. Your call.

### REV-002 (HIGH) Judges cannot reach the repo or the live app

This is entirely ops and needs your explicit go-ahead:
- Make the repository public.
- Point DNS and deploy the site.
- Record the demo video.
- Submit on DoraHacks.

I have not done any of these. Per your standing rules I do not publish, deploy, or push without you asking.

## Verification run

All checks below were run against the current working tree.

| Check | Command | Result |
|---|---|---|
| Site production build | `npm run build` (in `site/`) | Pass, all 6 routes prerendered static |
| Type check | `npx tsc --noEmit` (in `site/`) | Pass, exit 0 |
| Contract tests | `forge test -vvv` | 61 passed, 0 failed across 7 suites |
| Contract formatting | `forge fmt --check` | Pass, exit 0 |
| Landing smoke | `node web/smoke.mjs` | Pass: both scenarios, 360px, keyboard, link readback, secret scan |
| Surfaces smoke | `node web/smoke-surfaces.mjs` | Pass: receipt, inspector, brief, cross-links, 360px, keyboard, secret scan |
| Hallmark UI, real chromium | headless chromium against `next start` | Pass: 2 eyebrows only, keyboard pause toggles `aria-pressed` and stops the marquee, proof-close footer present, no reveal block stuck hidden, zero console errors |
| Marquee pause on mobile, real chromium | headless chromium at 320/360/375/414/559/560px | Pass: pause control rendered, inside the viewport, keyboard-focusable, and stops the marquee at every width |
| Security headers, real chromium | headless chromium (REV-008) | Pass: headers on every route, zero CSP violations |

## Files touched

New:
- `site/components/ProofStrip.tsx`
- `web/smoke-server.mjs`
- `LICENSE`
- `.github/workflows/ci.yml`

Modified (site): `site/app/page.tsx`, `site/app/globals.css`, `site/app/app/page.tsx`, `site/app/app/activity/page.tsx`, `site/app/app/receipt/page.tsx`, `site/app/app/layout.tsx`, `site/components/Reveal.tsx`, `site/components/SiteFooter.tsx`, `site/components/Faq.tsx`, `site/next.config.ts`, `site/README.md`, `site/data/proof-gate.json`.

Modified (contracts and proof): `contracts/src/JorqethSettlement.sol`, `contracts/test/SettlementInvariants.t.sol`, `contracts/test/FccSettlement.t.sol`, `contracts/test/JorqethTestBase.sol`, `script/PositiveProof.s.sol`, `script/NegativeProof.s.sol`, `evidence/proof-gate.json`, `evidence/proof-gate.md`.

Modified (web and tools): `web/smoke.mjs`, `web/smoke-surfaces.mjs`, `web/serve.mjs`, `tools/tee-signer/main.go`, `README.md`.

## Re-review round (working tree)

A follow-up re-review reopened three items as partial and flagged two hygiene issues. All
are fixed and verified against a real check. This round is uncommitted, awaiting review.

- REV-003 (was partial): withdrawal unlocked exactly at `campaignEnd` while settlement was
  still reachable after it, so a late result could be stranded. Closed by capping a
  settleable result's `expiry` at `campaignEnd` in `settle`, making the settle and
  withdraw windows provably disjoint. Details and the three new tests are in the REV-003
  section above.
- REV-004 (was partial): the root `README.md` still read "judge-ready" and drew an FCE,
  orchestrator, synthetic merchant API, and Coston2 contract as live architecture. Dropped
  "judge-ready", reframed "The idea" and "Architecture" so those pieces are marked target
  design with a "what runs today" line beside them, and corrected the stale "55 passing
  tests" to the real 61.
- Hallmark marquee (was partial): the pause control worked on desktop but CSS hid it below
  560px while the marquee kept moving, leaving mobile users with no accessible stop. The
  `display: none` rule is gone. The control now stays reachable below 560px with a solid
  pill and a right-edge fade so the scrolling text does not bleed under it. Verified across
  320/360/375/414/559/560px.
- `forge fmt --check` failed on the two proof scripts. Reformatted
  `script/PositiveProof.s.sol` and `script/NegativeProof.s.sol`; `forge fmt --check` now
  exits 0.
- This changelog was stale (claimed everything uncommitted while the first round was
  committed as `ea6ccd2`). Corrected here.

The `+349` gas on `settle` from the new expiry check made the committed evidence drift, so
the positive-proof and proof-gate evidence were regenerated against the fixed contract and
the `site/data` mirror re-synced byte-identical (CI's `cmp` check stays green).

Files changed this round: `contracts/src/JorqethSettlement.sol`,
`contracts/test/JorqethTestBase.sol`, `contracts/test/SettlementInvariants.t.sol`,
`script/PositiveProof.s.sol`, `script/NegativeProof.s.sol`, `site/app/globals.css`,
`README.md`, `evidence/positive-proof.json`, `evidence/positive-proof.md`,
`evidence/proof-gate.json`, `evidence/proof-gate.md`, `site/data/positive-proof.json`,
`site/data/proof-gate.json`, and this file.

## Commit state

The first pass is committed as `ea6ccd2` under the repository owner's Git identity. The
re-review round above is staged in the working tree, uncommitted. Say the word and I will
commit it under your Git identity. I will not push, merge, or deploy unless you ask.
