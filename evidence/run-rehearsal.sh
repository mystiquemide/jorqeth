#!/usr/bin/env bash
#
# Cold-start rehearsal: prove the complete demo journey runs truthfully
# and repeatably from a known clean state, end to end, in one command.
#
#   bash evidence/run-rehearsal.sh
#
# Phases (each timed):
#   1. PROOF      re-run evidence/run-proof-gate.sh — a fresh anvil boot, the full forge
#                 suite, and both on-chain proofs, resolving the nine verification checks
#                 (9/9). This is the "cold chain -> verification" leg of the demo.
#   2. WALK       boot the zero-dependency static server and drive the verification page
#                 through the entire run-of-show with `node web/smoke.mjs`: funded campaign,
#                 eligible exact payout (0 -> 20, +20 mUSD), negative zero-payout, replay
#                 read as AlreadySettled, the forced-failure branch (infra-unknown /
#                 fleet-outage / error-status) shown as retryable and NOT paid, every
#                 evidence link resolves, rendered-DOM secret scan, 360px + keyboard.
#
# Exit 0 only if BOTH phases pass. Prints a timing record so two consecutive runs can be
# compared against a 90-120s target. No secrets, no live systems, no writes
# outside evidence/. Run it twice back to back for the two-consecutive-clean-runs gate.
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

now() { date +%s; }
T0=$(now)

echo "=== Jorqeth demo rehearsal (cold start) ==="
echo "    started $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ---- Phase 1: cold chain -> verification suite ----
echo "--> [1/2] PROOF  : evidence/run-proof-gate.sh (fresh anvil, full suite, both proofs)"
P1=$(now)
if bash evidence/run-proof-gate.sh > evidence/rehearsal.proof.log 2>&1; then
  GATE=PASS
else
  GATE=FAIL
fi
P1E=$(now)
echo "    verification   : $GATE ($((P1E - P1))s)"

# ---- Phase 2: serve + verification walkthrough ----
echo "--> [2/2] WALK   : node web/smoke.mjs (served page, full run-of-show)"
P2=$(now)
if node web/smoke.mjs > evidence/rehearsal.page.log 2>&1; then
  PAGE=PASS
else
  PAGE=FAIL
fi
P2E=$(now)
echo "    demo walk      : $PAGE ($((P2E - P2))s)"

TE=$(now)
echo "=== rehearsal total: $((TE - T0))s (proof $((P1E - P1))s + walk $((P2E - P2))s) ==="

if [ "$GATE" = PASS ] && [ "$PAGE" = PASS ]; then
  echo "REHEARSAL PASSED. verification 9/9 and full demo walkthrough both green from a cold start."
  exit 0
fi
echo "REHEARSAL FAILED. gate=$GATE page=$PAGE (see evidence/rehearsal.proof.log, evidence/rehearsal.page.log)"
exit 1
