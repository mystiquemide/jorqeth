import Link from "next/link";
import type { Metadata } from "next";
import { fxrpProof as proof } from "@/lib/fxrp-proof";

export const metadata: Metadata = {
  title: "FXRP verification details",
  description:
    "Inspect the live Flare Confidential Compute result, domain binding, FXRP campaign, and fail-closed settlement state on Coston2.",
};

const CHECKS = [
  {
    n: "01",
    title: "FCE instruction confirmed on Coston2",
    desc: `The verification transaction succeeded in block ${proof.instruction.blockNumber.toLocaleString("en-US")} and emitted instruction ${proof.instruction.id}.`,
  },
  {
    n: "02",
    title: "Signed ActionResult returned",
    desc: `The hosted Flare Confidential Compute result returned status ${proof.actionResultStatus}, with a ${proof.teeSignatureBytes}-byte TEE signature and ${proof.proxySignatureBytes}-byte proxy signature.`,
  },
  {
    n: "03",
    title: "Result bound to this campaign",
    desc: `The result is bound to chain ${proof.chainId}, campaign ${proof.campaign}, creator ${proof.creator}, and the campaign rule version.`,
  },
  {
    n: "04",
    title: "Exact FXRP amount returned",
    desc: `The eligible private record resolved to exactly ${proof.verifiedAmount.toFixed(6)} test FXRP at a ${proof.commissionBps / 100}% commission rule.`,
  },
  {
    n: "05",
    title: "Settlement failed closed",
    desc: `The settlement transaction reverted. The campaign still holds ${proof.escrowAtSettlement.toFixed(6)} test FXRP and reports ${proof.totalSettled.toFixed(6)} total settled, so the failed attempt moved no commission value.`,
  },
] as const;

export default function Inspector() {
  return (
    <>
      <div className="crumb">
        <Link href="/app">Dashboard</Link> <span>/</span> FXRP verification details
      </div>

      <div className="panel">
        <div className="panel__head">
          <div>
            <div className="panel__title">The live FXRP verification boundary</div>
            <div className="panel__sub">
              This is the actual Coston2 attempt from the current FXRP campaign, not the old local compatibility fixture.
            </div>
          </div>
          <span className="pill pill--retry"><span className="pd" />Verification passed · payout not completed</span>
        </div>

        <div className="steps-v">
          {CHECKS.map((check) => (
            <div className="step-v" key={check.n}>
              <div className="step-v__i">{check.n}</div>
              <div style={{ minWidth: 0 }}>
                <div className="step-v__t">{check.title}</div>
                <div className="step-v__d">{check.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel__title" style={{ marginBottom: 16 }}>Flare Confidential Compute</div>
          <div className="kv">
            <div className="kv__row"><span className="kv__k">Instruction ID</span><span className="kv__v mono">{proof.instruction.id}</span></div>
            <div className="kv__row"><span className="kv__k">Instruction tx</span><span className="kv__v mono">{proof.instruction.transaction}</span></div>
            <div className="kv__row"><span className="kv__k">ActionResult status</span><span className="kv__v">{proof.actionResultStatus} · success</span></div>
            <div className="kv__row"><span className="kv__k">TEE signature</span><span className="kv__v">{proof.teeSignatureBytes} bytes</span></div>
            <div className="kv__row"><span className="kv__k">Proxy signature</span><span className="kv__v">{proof.proxySignatureBytes} bytes</span></div>
            <div className="kv__row"><span className="kv__k">FCE verifier</span><span className="kv__v mono">{proof.verifier}</span></div>
          </div>
          <a className="btn btn--primary docs-cta" href={proof.instructionUrl} target="_blank" rel="noreferrer">
            Open verification transaction
          </a>
        </div>

        <div className="panel">
          <div className="panel__title" style={{ marginBottom: 16 }}>What the result carries</div>
          <div className="kv">
            <div className="kv__row"><span className="kv__k">Order digest</span><span className="kv__v mono">{proof.orderDigest}</span></div>
            <div className="kv__row"><span className="kv__k">Eligibility</span><span className="kv__v">ELIGIBLE ({proof.eligibilityCode})</span></div>
            <div className="kv__row"><span className="kv__k">Amount</span><span className="kv__v">{proof.verifiedAmount.toFixed(6)} test FXRP</span></div>
            <div className="kv__row"><span className="kv__k">Creator</span><span className="kv__v mono">{proof.creator}</span></div>
            <div className="kv__row"><span className="kv__k">Settlement</span><span className="kv__v mono">{proof.campaign}</span></div>
            <div className="kv__row"><span className="kv__k">Rule</span><span className="kv__v">{proof.commissionBps / 100}% commission</span></div>
          </div>
          <div className="callout" style={{ marginTop: 16 }}>
            <b>No raw merchant record is shown here.</b> The public result carries an opaque digest and the minimum domain-bound fields needed for verification and settlement.
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel__title" style={{ marginBottom: 16 }}>Fail-closed settlement state</div>
        <div className="kv">
          <div className="kv__row"><span className="kv__k">Settlement tx</span><span className="kv__v mono">{proof.settlement.transaction}</span></div>
          <div className="kv__row"><span className="kv__k">Receipt status</span><span className="kv__v">Reverted</span></div>
          <div className="kv__row"><span className="kv__k">Verified payout</span><span className="kv__v">{proof.verifiedAmount.toFixed(6)} test FXRP</span></div>
          <div className="kv__row"><span className="kv__k">Escrow available</span><span className="kv__v">{proof.escrowAtSettlement.toFixed(6)} test FXRP</span></div>
          <div className="kv__row"><span className="kv__k">Total settled</span><span className="kv__v">{proof.totalSettled.toFixed(6)} test FXRP</span></div>
        </div>
        <a className="btn btn--tinted docs-cta" href={proof.settlementUrl} target="_blank" rel="noreferrer">
          Inspect reverted settlement
        </a>
      </div>

      <div className="callout">
        <b>Honest status.</b> The current FXRP path has a genuine successful FCE verification, but this specific payout has not completed yet. Add enough test FXRP to cover the verified amount and submit a fresh settlement. The older completed mUSD FCE proof remains on the{" "}
        <Link href="/proof" style={{ color: "var(--jade-deep)" }}>completed proof page</Link> until a successful FXRP payout replaces it.
      </div>
    </>
  );
}
