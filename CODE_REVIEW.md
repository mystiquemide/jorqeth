<!-- Hallmark · pre-emit critique: P5 H5 E4 S5 R4 V4 -->

# Code Review

## Review Metadata

- Project: Jorqeth
- Review date: 2026-08-11 UTC
- Reviewer: Independent repository, security, and hackathon reviewer
- Review target: Full local repository baseline plus judge-facing public surfaces
- Base revision: Public `origin/main` at `58e0e50aa3def1df1aa7aaea936304258fe58010`
- Head revision: Local `HEAD` at `e8faf77d63513b849d696660cd290185c09f7f0b`
- Review mode: Full baseline and release-readiness review
- Secondary focus: Smart-contract security, Flare sponsor fit, hackathon eligibility, judge experience, and automated-review readiness
- Plan phase or checkpoint: Claimed Milestone 10 complete, independently assessed before submission
- Files reviewed: All first-party contracts, proof scripts, test suites, evidence generators, public evidence, root documentation, `web/`, and `site/`. Dependency source under `lib/` received version and usage review rather than line-by-line review.
- Files excluded: Generated `out/`, `cache/`, `broadcast/`, `site/.next/`, and dependency internals under `lib/`
- Environment: Ubuntu, Foundry 1.7.x, Solidity 0.8.28, Node 22.23.0, Next.js 16.3.0, Go toolchain available, authenticated GitHub CLI, signed-out HTTP checks
- Overall confidence: High for local code and repository state. Medium for event eligibility because the DoraHacks page returned HTTP 405 to direct extraction and no submitted project page was available.

## Verdict

Changes required.

The settlement and verifier test suite is strong, but the current project is not ready for submission. The implementation does not contain the approved FCE and merchant-record evaluation path, the merchant can remove all escrow before settlement, the public repository is private, and `jorqeth.app` does not resolve. The current public proof demonstrates a local Anvil settlement against a mock TEE registry and a locally constructed signed result. It does not demonstrate a confidential merchant-record evaluation or live Flare instruction round trip.

Hackathon strategy verdict: BUILD BUT CUT SCOPE.

Stop adding presentation surfaces. Spend the remaining time on one truthful sponsor path, public access, escrow integrity, and submission proof. If a simulated FCE round trip cannot be completed, position Jorqeth as a settlement-verifier prototype and remove claims that a merchant record was privately read or evaluated.

## Executive Summary

Jorqeth has a clear problem, a memorable invariant, unusually good local proof packaging, and a well-tested Solidity core. The 55 Foundry tests, 27 web model tests, deterministic evidence gate, genuine Flare signature compatibility vector, and fail-closed settlement behavior are real strengths. The main gap is architectural: the proof scripts construct `PayableResult` locally, sign it with a local test key, register that key in a mock registry, and settle on Anvil. No FCE handler, merchant API, orchestrator, external record fetch, or instruction runner exists in the repository. This falls short of both the approved amendment and the strongest public sponsor claims. The contract also lets the merchant withdraw escrow at any time, so prefunding does not give the creator a durable payout guarantee. Current judge access is blocked because the GitHub repository is private and the configured custom domain has no resolvable DNS record. Overall submission health is D today, while isolated code and test health is B-. The fastest credible route is to finish one simulated FCE-to-settlement path or narrow the claims, lock escrow until a defined campaign end, publish and deploy the current revision, and submit a short evidence-led demo.

## Scope and Limitations

- Local code conclusions apply to `e8faf77`.
- Public GitHub conclusions apply to `58e0e50`, which is one commit behind local `HEAD`.
- The local-only commit adds social cards and metadata, and removes the landing-page honest-status note. Judges cannot see it until it is pushed.
- No live contract address or Coston2 deployment was supplied or found, so deployed bytecode and live state could not be verified.
- `https://jorqeth.app` failed DNS resolution from the audit environment. Live HTML, TLS, platform headers, redirects, and production runtime behavior were therefore unavailable.
- The repository is private. Authenticated GitHub metadata was inspectable, while a signed-out request returned 404.
- Codex Security was cancelled before launch. Security findings below come from manual review, Foundry lint, Slither, dependency checks, history scanning, and runtime checks. They do not claim Codex Security scan coverage.
- The direct DoraHacks event page returned HTTP 405. Eligibility checks use the repository plan, Mide OS tracker, the public event URL, and an accessible event mirror. Final form state still requires human confirmation.
- No implementation code was changed. The audit generated and then removed one untracked Go binary. Only this report remains as a new repository file.

## Requirements Reviewed

- Approved winning core and sponsor dependency in `PROJECT_PLAN.md:390-420`
- FCE instruction and merchant-record acceptance criteria in `PROJECT_PLAN.md:486-524`
- Positive, negative, proof-gate, UI, and packaging gates in `PROJECT_PLAN.md:526-610` and `PROJECT_PLAN.md:990-1026`
- Approved simulated-attestation amendment in `PROJECT_STATE.md:624-636`
- Settlement safety rules `BR-001` through `BR-008` and requirements `FR-001` through `FR-014`
- Privacy, replay, domain binding, expiry, failure, mobile, dependency, and submission requirements
- Flare Summer Signal submission fields and Confidential Compute Apps track fit

Terms used in this report:

| Term | Meaning |
|---|---|
| FCC | Flare Confidential Compute |
| FCE | Flare Confidential Compute App |
| TEE | Trusted execution environment |
| CSP | Content Security Policy |

## Repo Map

Purpose: confidential creator and affiliate commission settlement from an agreed merchant record, with merchant-funded escrow and a Flare FCC result-authenticity boundary.

Stack and architecture:

```text
Committed evidence and spec
        |
        +--> legacy read-only web pages in web/
        +--> Next.js product and proof site in site/

Local proof script
        |
        +--> MockUSD
        +--> MockTeeMachineRegistry
        +--> FccResultVerifier
        +--> JorqethSettlement

Missing from the implemented path
        |
        +--> FCE handler
        +--> merchant record API or fixture service
        +--> instruction submission and result retrieval
        +--> Coston2 deployment
```

Key areas:

| Area | Purpose |
|---|---|
| `contracts/src/` | Settlement, result schema, local verifier, FCC-compatible verifier, mock token |
| `contracts/test/` | Golden vectors, verifier compatibility, fail-closed behavior, accounting tests |
| `script/` | Positive and negative Anvil proof deployment scripts |
| `evidence/` | Reproducible proof gate, generated JSON and Markdown evidence, rehearsal scripts |
| `tools/tee-signer/` | Go helper that reproduces the pinned Flare signing scheme |
| `web/` | Original zero-dependency evidence replay and browser smokes |
| `site/` | New Next.js landing page and evidence dashboard |
| `spec/jorqeth-v1.json` | Frozen campaign, schema, rule, and vector source of truth |

Surprises:

- The README architecture includes an orchestrator, FCE, and synthetic merchant API, but none exists in first-party code.
- Two separate judge frontends exist. The root README documents only `web/`, while `site/README.md` remains the generic create-next-app text.
- The proof gate labels the FCC path real and load-bearing based on signature compatibility and registry tests, without running an extension or merchant evaluation.

## Verification Performed

| Check | Scope | Result | Evidence |
|---|---|---|---|
| Git fetch and revision comparison | Local versus public main | Pass, mismatch found | Local `e8faf77`, public `58e0e50`, local ahead by one commit |
| Git working tree | Review baseline | Pass before report | Clean except local branch ahead by one commit |
| GitHub signed-out access | Public judge access | Fail | `https://github.com/mystiquemide/jorqeth` returned 404 and GitHub API reports `PRIVATE` |
| GitHub metadata | About, topics, homepage, license, CI, PRs | Fail for readiness | Empty description/homepage/topics, no license metadata, no open PRs, no workflow runs |
| Live domain | `jorqeth.app` and core routes | Fail | DNS resolution failed for `/`, `/app`, receipt, inspector, activity, and 404 route |
| Foundry formatting | First-party Solidity | Pass | `forge fmt --check`, exit 0 |
| Foundry build | Contracts and scripts | Pass | `forge build`, exit 0 |
| Foundry tests | Seven suites | Pass | 55 passed, 0 failed, 0 skipped |
| Proof gate | Tests, positive proof, negative proof, privacy scan | Pass with scope caveat | 9 of 9 under the repository's own gate, evidence unchanged |
| Foundry lint | Contracts, tests, scripts | Pass with warnings | Eight warnings, six safe short-string casts and two timestamp comparisons |
| Slither | First-party contracts | Completed with findings | Six detector results, no confirmed critical exploit. Timestamp and complexity notes remain. Exit 255 because findings were emitted. |
| Web model tests | Evidence replay models | Pass | 27 passed, 0 failed |
| Legacy browser smoke | `web/` | Partial | Surface smoke passed. Main smoke hit `EADDRINUSE` but still exited 0 against an existing server. |
| Next.js clean install | `site/` | Pass | `npm ci --ignore-scripts`, 33 packages installed |
| TypeScript | `site/` | Pass | `npx tsc --noEmit`, exit 0 |
| Next.js production build | Six routes plus not-found | Pass | `npm run build`, all routes statically generated |
| Next.js local production smoke | `/`, four app routes, 404 | Pass for local runtime | Correct 200 and 404 statuses, route titles, no console errors |
| 360px browser audit | Five Next.js routes | Fail on dashboard metrics | Four-column inline grid extends to 518px in a 360px viewport |
| npm dependency audit | Production dependencies | Pass | Zero known vulnerabilities |
| Go helper | Build, test, vet | Pass | Build and vet clean, package has no Go tests |
| Secret pattern scan | Current tree and Git history | Pass for undisclosed secrets | No credential patterns found. A documented public Anvil private key is intentionally tracked. |
| Evidence mirroring | `evidence/`, `spec/`, `site/data/` | Pass | All four source and vendored JSON pairs are byte-identical |
| Security headers | Local Next production response | Fail for hardening | No CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy |
| Demo video and final submission | Internal checklist and Mide OS tracker | Not complete | Internal checklist unchecked and tracker next action still says finish proof, demo, and submit |

## Findings Summary

| Severity | Count |
|---|---:|
| Blocker | 0 |
| Critical | 0 |
| High | 3 |
| Medium | 4 |
| Low | 1 |
| Nit | 0 |
| Positive | 6 |

## Blocking Findings

## [HIGH] REV-001: The sponsor path never executes an FCE or merchant-record evaluation

- Category: Architecture, sponsor integration, plan conformance, claim accuracy
- Location: `script/PositiveProof.s.sol:76-96`, `script/PositiveProof.s.sol:115-144`, `PROJECT_PLAN.md:504-520`, `PROJECT_STATE.md:624-636`
- Requirement or control: The approved plan and amendment require a real Flare software-stack instruction that evaluates an allowlisted merchant record in simulated-attestation mode, returns the frozen result, and makes FCC load-bearing.
- Evidence: The positive proof deploys `MockTeeMachineRegistry`, registers a local key, constructs `PayableResult` from constants, signs it with `vm.sign`, and calls `settle`. Repository search found no FCE handler, merchant API, orchestrator, instruction sender, proxy client, or result retriever.
- Problem: The repository proves verifier compatibility and settlement enforcement, not private merchant-record evaluation. The state file marks the amended integration complete even though the amended execution path is absent.
- Impact: Sponsor integration is replaceable by any signer that can produce the same envelope. Judges cannot verify the core claim that a private record was evaluated inside Flare Confidential Compute. This is the strongest technical and judging risk.
- Reproduction or failure scenario: Run `rg -n 'action|merchant|instruction|sendInstructions|POST /action'` across first-party runtime code, then inspect `PositiveProof._deployFundSettle`, `_buildResult`, and `_teeProof`. The complete successful path begins after the alleged confidential computation and fabricates every result field locally.
- Recommended correction: Build the smallest supported simulated FCE handler and fixed synthetic record source, send one instruction through the real scaffold, capture its returned `ActionResult`, normalize the signature for EVM verification, then settle that exact result. If this cannot be completed before the deadline, remove merchant-read and private-evaluation claims and submit the narrower verifier and settlement prototype honestly.
- Verification after correction: A clean command must start the fixed merchant source and simulated FCE stack, submit the instruction, capture identifiers and redacted logs, compare the returned data byte-for-byte to the frozen schema, settle it, and fail when the FCE or active TEE is removed.
- Confidence: High
- Status: Open

## [HIGH] REV-002: Judges cannot access the repository or configured live application

- Category: Eligibility, deployment, judge experience
- Location: GitHub repository metadata, `site/app/layout.tsx:28`, `SUBMISSION.internal.md:114-118`
- Requirement or control: Judges need a working demo link or reproducible technical materials, public access, deployment references where applicable, and a completed final submission.
- Evidence: GitHub API reports the repository as private. A signed-out request returns 404. `jorqeth.app` does not resolve. GitHub has no homepage URL. The internal submission checklist still marks public repo, demo video, link confirmation, and DoraHacks submission incomplete.
- Problem: The two main judge entry points are unavailable outside the owner's authenticated environment.
- Impact: A judge or automated evaluator cannot open the code or product. This can invalidate the submission before code quality is considered.
- Reproduction or failure scenario: Open the GitHub URL signed out and receive 404. Resolve or request `https://jorqeth.app` and receive a DNS failure.
- Recommended correction: Make the repository public, add a license file, set GitHub About metadata and homepage, deploy the exact public commit, configure and verify DNS/TLS, then test every route from a signed-out network. Record and upload the demo, then complete the DoraHacks form before the internal cutoff.
- Verification after correction: Signed-out GitHub returns 200. The live homepage, dashboard, receipt, inspector, matrix, OG image, and 404 route return expected statuses. The submission page shows a final submitted state and all links resolve.
- Confidence: High
- Status: Open

## [HIGH] REV-003: The merchant can revoke all prefunded escrow before settlement

- Category: Smart-contract business logic and funds availability
- Location: `contracts/src/JorqethSettlement.sol:34-47`, `contracts/src/JorqethSettlement.sol:167-175`
- Requirement or control: Merchant funding precedes settlement, and the plan describes reclaiming unspent escrow after the campaign window. Public copy says the payout is enforced by the contract rather than merchant goodwill.
- Evidence: `withdrawEscrow` checks only `msg.sender == merchant` and available balance. The contract stores no campaign end, settlement window, cancellation state, or creator protection. Existing tests prove immediate withdrawal succeeds.
- Problem: The merchant may fund the campaign for display, then withdraw the complete escrow at any time, including immediately before a valid creator settlement.
- Impact: Prefunding does not guarantee funds availability. The creator still trusts the merchant not to remove escrow, undermining the product thesis and causing valid results to revert with `InsufficientEscrow`.
- Reproduction or failure scenario: Fund 100 mUSD, have the merchant call `withdrawEscrow(100 mUSD)`, then submit an otherwise valid eligible result. Settlement reverts and the creator receives nothing.
- Recommended correction: Freeze withdrawals until a defined immutable campaign end plus any settlement grace period. If early cancellation is required, define explicit conditions and preserve liabilities for already issued or pending results. Add an event and state transition for campaign closure.
- Verification after correction: Tests must show withdrawal before campaign end reverts, valid settlement remains funded, post-window withdrawal succeeds, and boundary timestamps cannot strand valid results.
- Confidence: High
- Status: Open

## Other Findings

## [MEDIUM] REV-004: Public copy overstates what is live, private, and proven

- Category: Documentation, UX trust, automated-judge accuracy
- Location: `site/app/page.tsx:47-50`, `site/app/page.tsx:164-168`, `site/app/app/layout.tsx:5-15`, `site/components/Faq.tsx:14-24`, `README.md:199-202`, `tools/tee-signer/main.go:90-94`
- Requirement or control: Visible claims must match observable evidence and disclose replay, simulated attestation, synthetic data, and local-chain limitations clearly.
- Evidence: The landing page says Jorqeth reads the merchant record privately and pays on-chain, while no merchant evaluation exists. App metadata and headings call the replay a live proof. The shell presents a fixed evidence address as a connected creator. README and FAQ claim no private key appears in any tracked file, while `tools/tee-signer/main.go` contains the documented Anvil private key literal. The local-only polish commit also removes the landing-page honest-status note.
- Problem: Honest caveats exist deeper in the app, but the first impression and absolute privacy statements exceed the evidence.
- Impact: Judges may interpret this as misleading packaging. Automated checks can directly disprove the tracked-key claim and find only local Anvil addresses.
- Reproduction or failure scenario: Read the homepage hero and app metadata before reaching the bottom callout, then compare those claims with the proof scripts and tracked Go key.
- Recommended correction: Put `Local replay, simulated attestation, synthetic records` beside the first proof CTA. Replace `live`, `real payout`, `connected`, and absolute tracked-file claims with precise wording. Keep the honest-status note until a matching FCE and live deployment exist.
- Verification after correction: Search every README, metadata field, component, screenshot, submission field, and video line for `live`, `real`, `private`, `connected`, `Coston2`, and `no private key`. Each occurrence must match a linked proof.
- Confidence: High
- Status: Open

## [MEDIUM] REV-005: Four-column inline styles break the 360px dashboard

- Category: Frontend, responsive UX, accessibility
- Location: `site/app/app/page.tsx:68-99`, `site/app/app/activity/page.tsx:30-47`, `site/app/globals.css:102`, `site/app/globals.css:454-456`
- Requirement or control: `NFR-005` requires the judge flow to work at 360px. Milestone 9 requires all core routes to pass at that width.
- Evidence: Both pages set `gridTemplateColumns: repeat(4, 1fr)` inline. This overrides the mobile `.grid-3 { grid-template-columns: 1fr }` rule. At a 360px viewport, dashboard cards ended at x=130, 257, 392, and 518. The host had `clientWidth=274`, `scrollWidth=475`, and `overflow-x: visible`, while the root hides horizontal overflow.
- Problem: Retryable and Rejected cards are partly or fully clipped and cannot be reached through a scrollable container.
- Impact: The negative proof, one of the strongest judging assets, is incomplete on mobile. The existing no-document-overflow check misses clipped descendants.
- Reproduction or failure scenario: Open `/app` at 360px and inspect the Outcome spread. The fourth card begins at x=410 outside the viewport.
- Recommended correction: Remove the inline column declaration and use a dedicated responsive class. Use four columns on wide screens, two at tablet width, and one on narrow screens. Extend the browser test to assert every card's bounding rectangle intersects the viewport or an explicitly scrollable container.
- Verification after correction: At 360px, all four categories are readable without page-level horizontal clipping. Repeat for `/app/activity` and keyboard focus.
- Confidence: High
- Status: Open

## [MEDIUM] REV-006: The main browser smoke can report success after its server fails

- Category: Test reliability and CI evidence
- Location: `web/smoke.mjs:42-61`, `web/smoke.mjs:134-143`, `web/smoke-surfaces.mjs:38-57`, `web/smoke-surfaces.mjs:166-178`
- Requirement or control: Verification must fail if setup exits early or tests run against an unknown process.
- Evidence: Port 8123 was already occupied. The spawned server emitted `EADDRINUSE`, but the smoke connected to the existing listener, printed `SMOKE PASSED`, and exited 0. The script does not listen for child `error` or `exit`, does not use a random port, and does not prove the responding server belongs to the current checkout.
- Problem: A stale or unrelated server can satisfy the smoke and hide a broken current build.
- Impact: Release and CI evidence is weaker than claimed. The exact judge surface under review may never have started.
- Reproduction or failure scenario: Start any server on 8123, then run `node web/smoke.mjs`. The spawned process fails, but the test continues against the occupied port.
- Recommended correction: Allocate an ephemeral free port, wait for the spawned child readiness signal, fail on early exit or error, and fetch a checkout-specific nonce or expected content hash before assertions.
- Verification after correction: Occupying the preferred port must either select a different port or fail the smoke. Killing the child before readiness must produce nonzero exit.
- Confidence: High
- Status: Open

## [MEDIUM] REV-007: Repository packaging does not match the new product site

- Category: Documentation, DevEx, supply-chain trust, public presentation
- Location: `README.md:146-155`, `README.md:207-209`, `site/README.md:1-36`, repository `.github/` and root license state
- Requirement or control: Submission documentation, installation, live URL, license, CI evidence, and canonical judge path must be clear and current.
- Evidence: The root README documents only the legacy `web/` replay. `site/README.md` is the generic create-next-app template and references Geist, although the site uses different local fonts. No `LICENSE` file or GitHub license metadata exists despite the MIT claim. No GitHub Actions workflow or run exists. GitHub About metadata is empty.
- Problem: Judges see two competing frontends and no documented reason to choose one. The polished site has no repository-level setup, test, deployment, or canonical URL guidance.
- Impact: Clean-clone and automated evaluators may use the older surface, miss the product site, or treat the license and build claims as incomplete.
- Reproduction or failure scenario: Follow the root README and launch `web/`, then inspect the repository and discover an undocumented Next.js application with a boilerplate README.
- Recommended correction: Name one canonical judge route. Document the Next.js install, typecheck, build, start, routes, evidence sync, and deployment. Keep the legacy replay only as an explicit fallback. Add a real MIT `LICENSE`, minimal CI for Foundry, web tests, Next typecheck/build, and proof drift checks, then fill GitHub About metadata.
- Verification after correction: A fresh signed-out clone follows one README path to the same interface used in the demo. The exact public commit has green CI and detected license metadata.
- Confidence: High
- Status: Open

## [LOW] REV-008: The web deployment has no configured browser security headers

- Category: Web hardening
- Location: `site/next.config.ts:1-7`
- Requirement or control: Public submission routes should reduce framing, MIME sniffing, referrer leakage, and unnecessary browser capabilities.
- Evidence: The Next configuration is empty. Local production responses had no Content-Security-Policy, X-Frame-Options or CSP `frame-ancestors`, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy. Live deployment headers could not be checked because DNS failed.
- Problem: The deployed site will depend entirely on host defaults, which are not recorded or verified.
- Impact: This is limited because the current site is static and read-only, but it weakens public trust and future safety.
- Reproduction or failure scenario: Run the production build and inspect response headers for `/` and `/app`.
- Recommended correction: Add a conservative CSP and the standard response headers in Next configuration or the hosting layer. Allow only assets and scripts the static app needs.
- Verification after correction: Check headers on every live route and confirm the CSP produces no browser console violations.
- Confidence: Medium
- Status: Open

## Positive Practices

## [POSITIVE] REV-P01: Settlement authenticity is immutable

The token, verifier, schema, campaign, merchant, creator, and rule version are immutable. The verifier cannot be swapped after funding.

## [POSITIVE] REV-P02: Replay and transfer failure handling is strong

The settlement marks state before transfer, uses `nonReentrant` and `SafeERC20`, and transaction reversion restores state when token transfer fails. Tests prove replay prevention and rollback.

## [POSITIVE] REV-P03: FCC signature compatibility has unusually concrete evidence

The Go helper imports pinned Flare packages, the Solidity test fixes captured bytes and intermediate hashes, and the verifier rejects wrong chain, wrong signer, tampering, and non-OK status.

## [POSITIVE] REV-P04: Negative outcomes are modeled clearly

The code distinguishes terminal ineligibility from retryable infrastructure uncertainty. Refund consumes the digest with zero payout, while unknown, error, and fleet-outage paths revert without consuming it.

## [POSITIVE] REV-P05: Evidence drift controls are effective

The proof gate regenerated deterministic evidence without a tracked diff. `site/data` matches `evidence/` and `spec/` byte-for-byte.

## [POSITIVE] REV-P06: Dependency exposure is small

The contract uses pinned submodules, the Next production dependency audit reports zero known vulnerabilities, and the legacy replay has no runtime packages.

## Security Review

Threat boundary summary:

| Asset | Main control | Current assessment |
|---|---|---|
| Escrow funds | Immutable verifier, replay guard, SafeERC20, reentrancy guard | Payout integrity is strong, but funds availability is broken by unrestricted merchant withdrawal |
| Result authenticity | Flare-compatible signature digest and active TEE registry lookup | Compatibility is proven. Actual extension execution and registry deployment are not. |
| Domain binding | Chain, settlement address, campaign, creator, rule, expiry | Strong and well tested |
| Private merchant data | Minimal public schema and evidence scans | No real merchant data path exists, so confidentiality is asserted rather than exercised |
| Browser data | Static evidence, React escaping, legacy `textContent` binding | Low injection exposure |
| Secrets | No undisclosed credentials found | Public Anvil dev keys are tracked intentionally, so absolute no-key claims must be removed |

Manual review found no direct unprivileged theft path in the tested settlement configuration. Slither reported timestamp use, ignored auxiliary return values, mixed dependency pragmas, and high cyclomatic complexity. The timestamp checks are appropriate for an hour-scale validity window. The ignored ECDSA auxiliary return and registry URL list are intentional. The main business-logic issue is funds availability, not signature bypass.

## Test and Evidence Review

The tests prove the local contract properties they claim. They do not prove the merchant-to-FCE path because that path is missing. The repository's proof gate incorrectly maps verifier compatibility tests to the statement that the current real FCC path works and is load-bearing at `evidence/run-proof-gate.sh:155-159`. That checklist item should remain failed until an instruction runs through an extension.

Missing or weak coverage:

- No FCE eligible, ineligible, malformed, unauthorized, timeout, or unknown-record tests
- No merchant source authentication or response-schema tests
- No instruction submission, polling, replay, or signature-normalization integration test
- No test that prevents merchant withdrawal before campaign end
- No Next.js component or browser tests committed for the new `site/`
- Browser smoke server ownership is not verified
- No CI proves the public commit

## Code Quality and Maintainability

The Solidity modules are focused, named clearly, and small enough to reason about. The result schema and trust boundary are explicit. The two frontend implementations create avoidable duplication, and the new site currently has no test suite or meaningful local README. The `settle` function has high cyclomatic complexity, but each branch maps to a security invariant and is still readable. Refactoring it before submission has lower payoff than fixing the missing FCE path and escrow window.

## Performance and Reliability

- Contract loops over the active TEE list returned by the registry. This is acceptable only if the official registry keeps that list bounded. A very large active set would raise settlement gas.
- The static Next.js pages build quickly and had no console errors locally.
- The landing page hides offscreen sections after hydration until an IntersectionObserver fires. Normal scrolling reveals them, but full-page automated screenshots captured large blank bands. This is an automated-review and social-proof risk.
- The proof scripts are fast and deterministic locally.
- Live reliability is unmeasurable because the custom domain does not resolve.

## Hallmark UI Audit

Hallmark verdict: ships as slop. The product has a specific visual voice, good type pairing, and useful evidence views. Repeated template patterns and mobile failures keep it below the audit bar. Hallmark did not edit or redesign the site.

### Critical

1. **Tell: The AI nav**
   - Where: `site/components/SiteNav.tsx:7-12`, `site/components/SiteNav.tsx:26-49`, `site/app/globals.css:227-245`
   - Severity: Critical
   - Evidence: The sticky header uses a wordmark, four inline links, a right-side call-to-action, a translucent light surface, and a bottom rule.
   - Fix: Use a product-specific navigation shape with fewer destinations or an app-oriented command entry.

2. **Tell: The 3-column feature grid**
   - Where: `site/app/page.tsx:130-187`, `site/app/globals.css:323-334`
   - Severity: Critical
   - Evidence: Three equal columns repeat a step label, icon tile, heading, and short body.
   - Fix: Replace the equal tiles with one compact process diagram or an asymmetric sequence.

3. **Tell: The AI footer**
   - Where: `site/components/SiteFooter.tsx:6-55`, `site/app/globals.css:384-396`
   - Severity: Critical
   - Evidence: A four-column grid, grouped links, top rule, and small copyright row use the common software-as-a-service footer pattern.
   - Fix: Close with one proof statement, the repository link, the test-mode disclosure, and copyright.

4. **Tell: Pure black, pure white**
   - Where: `site/app/globals.css:40-46`, `site/app/globals.css:173`
   - Severity: Critical
   - Evidence: `--surface` is pure `#FFFFFF`, and one hover state uses `#fff` outside the token set.
   - Fix: Use the existing tinted cream surface and route the hover value through a semantic token.

### Major

1. **Tell: Eyebrow on every section**
   - Where: `site/app/page.tsx:45`, `site/app/page.tsx:114`, `site/app/page.tsx:133`, `site/app/page.tsx:195`, `site/app/page.tsx:255`, `site/app/page.tsx:295`
   - Severity: Major
   - Evidence: Six sections use the same uppercase mono label before a heading.
   - Fix: Keep the label only where it explains a real sequence or proof state.

2. **Tell: Universal scroll-triggered fade-up**
   - Where: `site/components/Reveal.tsx:23-48`, `site/app/page.tsx:44-314`, `site/app/globals.css:211-219`
   - Severity: Major
   - Evidence: Almost every landing-page block waits for an intersection event and fades upward.
   - Fix: Keep one first-load entrance and render later sections without scroll-triggered hiding.

3. **Tell: Mid-render token improvisation**
   - Where: `site/app/globals.css:167`, `site/app/globals.css:173`, `site/app/globals.css:229-235`, `site/app/globals.css:381`, `site/app/globals.css:525`, `site/app/page.tsx:76`
   - Severity: Major
   - Evidence: Component rules and markup add raw hex and RGBA values outside the token block.
   - Fix: Add semantic tokens for each needed color and use only token references in components.

4. **Tell: Auto-rotating content with no keyboard pause**
   - Where: `site/app/globals.css:299-307`
   - Severity: Major
   - Evidence: The proof marquee pauses on hover but has no focus control or manual stop.
   - Fix: Render a static proof strip or add a keyboard-accessible pause control.

### Minor

1. **Tell: Every section padded the same**
   - Where: `site/app/globals.css:127-135`
   - Severity: Minor
   - Evidence: All landing sections inherit one vertical spacing rule despite different content density.
   - Fix: Use tighter proof sections and more space only around major narrative changes.

Hallmark summary: 4 critical, 4 major, 1 minor.

Ranked Hallmark punch list:

1. Fix the clipped 360px metric grids described in `REV-005`.
2. Remove page-wide reveal behavior so automated captures show the full story.
3. Replace the generic navigation and footer with proof-specific structures.
4. Collapse the three equal process cards into one clear sequence.
5. Remove decorative eyebrows and route every color through a token.

## Compatibility and Operations

- Foundry, Node, and Go builds passed in the current environment.
- The Go module requires Go 1.25.1, while the proof gate reports that its offline toolchain cannot regenerate the vector. The committed vector and Solidity test remain reproducible, but the documented full re-derivation is environment-sensitive.
- The public branch lacks the local metadata polish commit.
- No deployment configuration, uptime signal, rollback notes, monitoring, or live health endpoint exists.
- The local Next production server returned correct route statuses, but no browser security headers.

## Plan Conformance

| Plan area | Status | Evidence |
|---|---|---|
| Settlement invariant | Pass | 55 Foundry tests and proof gate |
| Exact positive payout on local Anvil | Pass | Deterministic `+20.000000` mUSD evidence |
| Negative, replay, domain, and failure paths | Pass locally | Twelve-path matrix |
| Real or simulated FCE instruction | Fail | No extension or instruction runtime exists |
| Merchant record evaluation | Fail | Result is built from constants in the Forge script |
| Coston2 deployment | Fail, disclosed | Local chain 31337 only |
| Merchant-funded escrow guarantee | Fail | Merchant can withdraw at any time |
| Truthful judge page | Partial | Deep caveats are good, first-impression claims overstate the proof |
| 360px judge flow | Fail on new dashboard | Two four-column grids clip |
| Demo video | Fail at current state | Internal checklist incomplete |
| Public repository and live URL | Fail | Private GitHub and unresolved DNS |
| Submission completeness | Fail at current state | No final submission confirmation |

The state file's “all ten milestones complete” and “judge-ready” conclusion is not supported by the repository and external state. Milestones 2, 3, 5, 9, and 10 do not meet their approved gates as written or amended.

## Hackathon Scorecard

| Dimension | Score | Judge view |
|---|---:|---|
| Problem quality | 8/10 | Clear creator versus merchant privacy tension and a crisp value proposition |
| Sponsor integration | 4/10 | Verifier scheme is real, but no extension or private record evaluation runs |
| Originality | 7/10 | Private commission settlement is more memorable than a generic wallet or dashboard |
| Technical execution | 7/10 | Strong contract tests and evidence, weakened by the missing integration and withdrawal flaw |
| UX and design | 6/10 | Attractive and evidence-led, but mobile clipping and claim ambiguity reduce trust |
| Proof quality | 6/10 | Excellent local invariant proof, incomplete sponsor and deployment proof |
| Presentation and demo | 4/10 | Strong assets, no reachable live surface or recorded demo |
| Submission readiness | 2/10 | Private repo, unresolved domain, incomplete form and video |
| Total | 44/80 | 55%, not finalist-ready today |

Separate readiness scores:

| Score | Result |
|---|---:|
| Code and repository health | 7.2/10 |
| Current eligibility readiness | 2.0/10 |
| Current winner competitiveness | 5.0/10 |

## Highest Priority Problems

| Rank | Issue | Why it hurts judging | Exact fix | Expected impact |
|---:|---|---|---|---|
| 1 | No FCE execution | Sponsor use looks cosmetic | Run one fixed record through the supported simulated extension into settlement, or narrow every claim | Largest technical-score gain |
| 2 | No public access | Judges cannot inspect anything | Public repo, deployed exact commit, DNS/TLS, signed-out route check | Restores eligibility |
| 3 | Escrow is revocable | Product promise still depends on merchant goodwill | Enforce campaign end and withdrawal grace period | Restores economic credibility |
| 4 | Claims exceed evidence | Creates distrust when judges inspect code | Put local replay caveat at first CTA and remove absolute claims | Improves trust and automated scoring |
| 5 | Mobile proof clipping | Hides negative proof on phones | Remove inline grid overrides and add bounding-box assertions | Improves judge flow |

## What Already Works

- The one-line problem and invariant are easy to remember.
- The local settlement proof is deterministic and inspectable.
- Failure states are more convincing than a typical hackathon happy path.
- The contract verifier boundary makes later integration possible without rewriting settlement.
- The receipt and proof inspector turn raw evidence into judge-friendly artifacts.
- The project clearly distinguishes merchant-source truth from universal attribution truth.

## Decisions That Must Be Locked Before More Code

- Choose whether the submission is a complete confidential app or a settlement-verifier prototype. Claims and demo must follow that decision.
- Freeze the supported FCC mode and exact execution command for the submission.
- Define campaign end, withdrawal timing, and liability for already issued results.
- Select one canonical judge frontend. Keep the other only as a documented fallback.
- Decide whether local Anvil is acceptable for submission. If yes, label it before the first CTA and never call it Coston2 or live.
- Freeze the exact public commit before recording the demo.

## Feature Audit

| Feature | Decision | Reason |
|---|---|---|
| Settlement contract and verifier boundary | KEEP | Core technical value |
| Positive and hostile-path proof scripts | KEEP | Strongest evidence asset |
| Genuine Flare signature vector | KEEP | Best sponsor-compatibility proof currently available |
| Receipt | KEEP | Fastest judge proof |
| Proof inspector | KEEP | Explains sponsor boundary |
| Twelve-path matrix | SIMPLIFY | Keep categories and top attacks, move full table below |
| Next.js landing page | SIMPLIFY | Lead with honest mode and one CTA |
| Scroll reveal animation | CUT | Adds blank automated screenshots and no judging value |
| Legacy `web/` frontend | DEFER as fallback | Avoid two equal canonical products |
| More visual polish or routes | CUT | No scoring value until sponsor and access blockers close |
| Multi-merchant, disputes, analytics, marketplace | DEFER | Correctly outside hackathon scope |

## Demo Plan

Target length: 90 to 105 seconds.

| Time | Scene | What appears | Intended judge reaction |
|---|---|---|---|
| 0:00-0:10 | Problem | Creator cannot inspect private merchant orders, merchant cannot publish them | “That is a real trust problem.” |
| 0:10-0:20 | Scope truth | Local simulated-attestation prototype, synthetic record, no production claim | “I can trust this presenter.” |
| 0:20-0:38 | Sponsor path | Show the actual FCE instruction and minimal returned fields | “Flare is essential here.” |
| 0:38-0:55 | Exact payout | Open the receipt and show five agreeing amount sources | “The result is concrete.” |
| 0:55-1:12 | Adversarial proof | Show refund zero, replay blocked, wrong domain blocked, fleet outage retryable | “They tested how it fails.” |
| 1:12-1:28 | Economic safety | Show escrow locked through the settlement window | “The creator is protected.” |
| 1:28-1:40 | Close | Repo, one-command proof, limitations, roadmap | “I can verify this quickly.” |

If the FCE path remains incomplete, replace the 0:20 scene with a precise verifier-compatibility explanation and call the project a prototype. Do not animate or imply a merchant fetch that did not run.

## README Blueprint

1. One-line problem and honest current mode
2. Thirty-second judge path with live URL, receipt, and proof command
3. What is implemented versus simulated versus future
4. Architecture diagram matching actual repository components
5. Flare integration with exact instruction, result, registry, and verifier evidence
6. Local proof results and limitations
7. Canonical Next.js run, typecheck, build, and production-start commands
8. Contract and security invariants
9. Public deployment references
10. New work versus inherited sources
11. License and roadmap

Delete or rewrite any architecture edge that has no corresponding implementation. Move the full twelve-path table into evidence documentation and keep only the judge-relevant summary near the top.

## Submission Checklist

- [ ] Repository public and signed-out accessible
- [ ] Local `HEAD` pushed and exact public SHA recorded
- [ ] MIT `LICENSE` file detected by GitHub
- [ ] GitHub description, homepage, and topics filled
- [ ] CI green on the submission SHA
- [ ] `jorqeth.app` DNS and TLS working
- [ ] Homepage, app, receipt, inspector, matrix, OG image, and 404 route verified signed out
- [ ] Actual FCE instruction proof completed, or claims narrowed
- [ ] Escrow withdrawal window fixed and tested
- [ ] 360px clipping fixed on both four-category grids
- [ ] Browser smoke cannot pass against an unrelated server
- [ ] README documents the canonical site and exact production command
- [ ] Demo video recorded from the exact public commit
- [ ] Submission fields match repository evidence
- [ ] Contract and transaction references labeled local or live accurately
- [ ] DoraHacks form submitted and confirmation captured before 2026-08-14

## Competitor Advantage Analysis

Typical finalists will outperform Jorqeth on live sponsor execution, public deployment, user feedback, and submission completeness. Jorqeth can outperform them on adversarial proof, claim precision, and an unusually clear settlement invariant. The project should not compete on feature count. Its best lane is a compact, inspectable proof that private evaluation controls real settlement and that every unsafe path fails closed.

## Improvement Strategy

### Theme 1: Proof must begin at the private record

Target state: one command starts a fixed record source, runs a real simulated FCE instruction, and settles the exact returned result. Principle: sponsor necessity is proven by execution, not interface compatibility.

### Theme 2: Prefunding must create a real obligation

Target state: escrow remains unavailable to the merchant until the settlement window closes. Principle: the contract should remove the exact trust the product claims to remove.

### Theme 3: One public truth across every surface

Target state: public repo, live site, README, metadata, video, submission form, and evidence all describe the same revision and the same limitations. Principle: judge trust is a consistency property.

### Theme 4: Verification must fail loudly

Target state: CI and browser smokes prove the current checkout, current server, current evidence, and mobile layout. Principle: a green command is useful only when setup failures cannot be ignored.

Trade-offs:

- Do not refactor the settlement function for style before submission.
- Do not add more dashboards, connectors, or animation.
- Do not pursue production Confidential Space if access remains externally blocked.
- Do not generalize beyond one merchant, creator, rule, and fixed record pair.

Done means:

- Zero High findings
- One actual FCE instruction-to-settlement proof, or a fully narrowed prototype claim set
- Escrow locked through a tested campaign window
- Public repo and live site available signed out
- Green CI on the exact submission SHA
- All 360px route checks pass
- Demo and DoraHacks form complete

## Task Plan

### Milestone 0: Safety net

| Task | Areas | Acceptance criteria | Effort | Change risk | Dependencies |
|---|---|---|---:|---|---|
| Fix smoke process ownership | `web/smoke*.mjs` | Occupied port and early child exit cause nonzero result | S | Low | None |
| Add CI and contract withdrawal regression | `.github/`, contracts tests | Exact public SHA runs Foundry, web, and site checks | M | Low | None |

### Milestone 1: Critical fixes

| Task | Areas | Acceptance criteria | Effort | Change risk | Dependencies |
|---|---|---|---:|---|---|
| Complete or cut the FCE path | New minimal extension and merchant fixture, scripts, docs | Real simulated instruction result reaches settlement, or every unsupported claim is removed | L | High | Sponsor scaffold access |
| Lock escrow through campaign end | Settlement, schema, scripts, tests | Early withdrawal reverts and post-window withdrawal succeeds | M | Medium | Freeze timing decision |
| Publish judge surfaces | GitHub, hosting, DNS | Signed-out repo and all live routes work | S to M | Medium | Exact submission SHA |

### Milestone 2: High-impact improvements

| Task | Areas | Acceptance criteria | Effort | Change risk | Dependencies |
|---|---|---|---:|---|---|
| Unify claims and canonical frontend | Root README, site README, metadata, UI copy | No unsupported live, private-read, Coston2, connected-wallet, or no-key claim remains | M | Low | FCE decision |
| Repair mobile proof layout | Dashboard, activity, browser tests | All cards visible at 360px | S | Low | None |
| Add repository trust metadata | License, About, homepage, topics | GitHub front page is complete | S | Low | Repo public |

### Milestone 3: Quality and polish

| Task | Areas | Acceptance criteria | Effort | Change risk | Dependencies |
|---|---|---|---:|---|---|
| Add security headers | Next config or host | Live header check passes without CSP errors | S | Low | Deployment |
| Remove scroll-reveal screenshot gaps | Landing animation | Full-page automated screenshot shows every section | S | Low | None |
| Record and submit | Video and DoraHacks | Public video and confirmed submission | M | Low | All P0 tasks |

Quick wins:

- Make the repository public and fill GitHub About metadata.
- Push the intended submission commit after review.
- Add `LICENSE`.
- Remove the inline four-column styles.
- Restore the honest-status note.
- Replace `live proof` and `connected creator` language.
- Document the Next.js site in the root README.

Top task implementation sketches:

1. FCE path: fork the pinned official extension scaffold, implement one fixed `POST /action` record lookup, emit only `PayableResult`, run in supported simulated mode, capture the real envelope, normalize signature `v`, and pass the exact result into `settle`. Avoid building a generalized API.
2. Escrow window: add immutable campaign end and a bounded settlement grace period. Reject withdrawals before the unlock timestamp. Test just-before, exact-boundary, just-after, and already-issued result behavior.
3. Public submission: freeze a commit, run the full clean-clone ladder, push, wait for CI, deploy that SHA, configure DNS, verify signed-out routes and metadata, then record the video from that deployment.

## Day-by-Day Execution Plan

### 2026-08-11

- Lock the truthful product scope.
- Fix escrow withdrawal and 360px layout.
- Fix browser smoke ownership.
- Decide and start the minimal FCE path.
- Make repo and live-surface prerequisites ready, without recording the final demo yet.

### 2026-08-12

- Finish the FCE instruction path or use the claim-cut fallback.
- Add CI, license, canonical README, and accurate metadata.
- Deploy the exact candidate and verify signed out.
- Run security, proof, browser, and mobile regression checks.

### 2026-08-13

- Freeze code and public evidence.
- Run clean-clone reproduction twice.
- Record the 90 to 105 second demo and backup capture.
- Prepare every DoraHacks field and link.
- Submit if all hard blockers are closed.

### 2026-08-14

- Use as buffer only.
- Recheck public repo, live routes, video visibility, submission status, and exact SHA.
- Submit by the internal 12:00 UTC target. Do not add features.

## Final Strategic Edge

Make the failure moment the demo climax. Show one result settle, then remove the active TEE or break the FCE path and prove the same payable result cannot move escrow. Most teams show a happy path. Jorqeth can win attention by proving sponsor dependence and failure safety in under twenty seconds, but only after the FCE path is real enough that removing it means something.

## Required Re-Review Scope

Re-review is required for:

- Any new FCE, merchant API, orchestrator, or instruction integration
- Settlement storage, constructor, withdrawal, campaign-window, or verifier changes
- All public claim and metadata changes
- Mobile layout changes on `/app` and `/app/activity`
- Browser smoke changes
- The exact pushed commit, GitHub visibility and metadata, CI results, live DNS/TLS, all core routes, security headers, video, and final submission state

The 55 existing contract tests and 27 legacy web tests need not be manually re-reviewed if they remain unchanged, but they must run again.

## Recommended Next Action

Freeze presentation work and choose one of two paths today:

1. Preferred: implement the smallest supported simulated FCE instruction that evaluates the fixed synthetic record and feeds its exact result into settlement.
2. Fallback: remove the private-record execution claim and submit Jorqeth as a local FCC-compatible settlement-verifier prototype.

Then fix the escrow withdrawal window before publishing. Public access alone would make the submission judgeable, but the sponsor and economic-integrity gaps determine whether it is competitive.

## Review Sources

- Repository at local `e8faf77d63513b849d696660cd290185c09f7f0b`
- Public GitHub main at `58e0e50aa3def1df1aa7aaea936304258fe58010`
- [Flare Summer Signal event page](https://dorahacks.io/hackathon/flaresummersignal/detail), direct extraction unavailable during review
- [Accessible Flare Summer Signal event mirror](https://www.hackathonradar.com/database/hackathon/93d91cae-47e7-4db4-8734-1a9ed4d3fc9a)
- [Flare Confidential Compute overview](https://dev.flare.network/fcc/overview)
- [Flare Foundation GitHub organization](https://github.com/flare-foundation)
- `tee-node` v0.0.24 `ActionResult.Hash` and `SignResult` source read directly through the GitHub API
- Mide OS Flare Summer Signal tracker record, read 2026-08-11
