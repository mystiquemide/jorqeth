import Link from "next/link";
import type { Metadata } from "next";
import { fxrpProof as proof } from "@/lib/fxrp-proof";

export const metadata: Metadata = {
  title: "Why this amount",
  description: "See how Jorqeth checked the latest private commission amount without exposing the merchant record.",
};

const CHECKS = [
  {
    n: "01",
    title: "The private check was submitted",
    desc: "Jorqeth sent the payment request to Flare without publishing the merchant's private sales record.",
  },
  {
    n: "02",
    title: "A trusted result came back",
    desc: "The private check returned a signed answer that Jorqeth can verify before any money moves.",
  },
  {
    n: "03",
    title: "The answer matched this payment",
    desc: "Jorqeth confirmed the answer belonged to this payment, this recipient, and this commission rule.",
  },
  {
    n: "04",
    title: `${proof.verifiedAmount.toFixed(0)} test FXRP was due`,
    desc: `The agreed record and ${proof.commissionBps / 100}% commission rule produced an exact payment of ${proof.verifiedAmount.toFixed(6)} test FXRP.`,
  },
  {
    n: "05",
    title: "The payment was stopped",
    desc: `Only ${proof.escrowAtSettlement.toFixed(0)} test FXRP was available, so Jorqeth paid nothing instead of making a partial or incorrect payment.`,
  },
] as const;

export default function Inspector() {
  return (
    <>
      <div className="crumb">
        <Link href="/app">Pay commission</Link> <span>/</span> Why this amount
      </div>

      <div className="panel">
        <div className="panel__head">
          <div>
            <div className="panel__title">How Jorqeth checked the payment</div>
            <div className="panel__sub">
              The private record stayed hidden. Jorqeth only received the information needed to decide how much should be paid.
            </div>
          </div>
          <span className="pill pill--retry"><span className="pd" />Check passed · payment stopped</span>
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
          <div className="panel__title" style={{ marginBottom: 16 }}>Amount checked</div>
          <div className="kv">
            <div className="kv__row"><span className="kv__k">Commission rate</span><span className="kv__v">{proof.commissionBps / 100}%</span></div>
            <div className="kv__row"><span className="kv__k">Amount due</span><span className="kv__v">{proof.verifiedAmount.toFixed(6)} test FXRP</span></div>
            <div className="kv__row"><span className="kv__k">Recipient</span><span className="kv__v mono">{proof.creator}</span></div>
            <div className="kv__row"><span className="kv__k">Private sales record</span><span className="kv__v">Hidden</span></div>
          </div>
        </div>

        <div className="panel">
          <div className="panel__title" style={{ marginBottom: 16 }}>Payment result</div>
          <div className="kv">
            <div className="kv__row"><span className="kv__k">Amount due</span><span className="kv__v">{proof.verifiedAmount.toFixed(6)} test FXRP</span></div>
            <div className="kv__row"><span className="kv__k">Money available</span><span className="kv__v">{proof.escrowAtSettlement.toFixed(6)} test FXRP</span></div>
            <div className="kv__row"><span className="kv__k">Amount missing</span><span className="kv__v">{proof.shortfall.toFixed(6)} test FXRP</span></div>
            <div className="kv__row"><span className="kv__k">Amount paid</span><span className="kv__v">{proof.totalSettled.toFixed(6)} test FXRP</span></div>
          </div>
        </div>
      </div>

      <div className="callout">
        <b>What you need to do:</b> add enough test FXRP to cover the amount due, run a new private check, then pay again.
      </div>

      <details className="panel">
        <summary className="panel__title">Technical proof</summary>
        <p className="panel__sub" style={{ marginTop: 10 }}>
          These fields are here for judges and developers. Normal users do not need them to use Jorqeth.
        </p>
        <div className="kv" style={{ marginTop: 16 }}>
          <div className="kv__row"><span className="kv__k">Flare check ID</span><span className="kv__v mono">{proof.instruction.id}</span></div>
          <div className="kv__row"><span className="kv__k">Check transaction</span><span className="kv__v mono">{proof.instruction.transaction}</span></div>
          <div className="kv__row"><span className="kv__k">Private-compute verifier</span><span className="kv__v mono">{proof.verifier}</span></div>
          <div className="kv__row"><span className="kv__k">Signed result</span><span className="kv__v">Verified</span></div>
          <div className="kv__row"><span className="kv__k">Private record fingerprint</span><span className="kv__v mono">{proof.orderDigest}</span></div>
          <div className="kv__row"><span className="kv__k">Payment contract</span><span className="kv__v mono">{proof.campaign}</span></div>
          <div className="kv__row"><span className="kv__k">Payment attempt</span><span className="kv__v mono">{proof.settlement.transaction}</span></div>
        </div>
        <div className="hero__actions" style={{ marginTop: 16 }}>
          <a className="btn btn--tinted" href={proof.instructionUrl} target="_blank" rel="noreferrer">Open check on Flare</a>
          <a className="btn btn--tinted" href={proof.settlementUrl} target="_blank" rel="noreferrer">Open payment attempt on Flare</a>
        </div>
      </details>
    </>
  );
}
