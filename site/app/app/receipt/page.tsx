import Link from "next/link";
import type { Metadata } from "next";
import { fxrpProof as proof } from "@/lib/fxrp-proof";

export const metadata: Metadata = {
  title: "Latest payment",
  description: "See the latest Jorqeth commission payment result in plain language.",
};

export default function Receipt() {
  return (
    <>
      <div className="crumb">
        <Link href="/app">Pay commission</Link> <span>/</span> Latest payment
      </div>

      <div className="panel">
        <div className="payout-hero">
          <div className="payout-hero__badge">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M12 8v5M12 17h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          <div>
            <div className="payout-hero__amt">
              {proof.verifiedAmount.toFixed(6)}<span className="u">test FXRP due</span>
            </div>
            <div className="payout-hero__meta">
              <span className="pill pill--retry"><span className="pd" />Not paid</span>
              <span>{proof.shortfall.toFixed(6)} test FXRP was missing</span>
            </div>
          </div>
        </div>
      </div>

      <div className="callout">
        <b>The amount was checked correctly, but the payment did not go through.</b> Jorqeth found that {proof.verifiedAmount.toFixed(6)} test FXRP was due while only {proof.escrowAtSettlement.toFixed(6)} test FXRP was available. Nothing was paid.
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel__title" style={{ marginBottom: 16 }}>What was due</div>
          <div className="kv">
            <div className="kv__row"><span className="kv__k">Commission rate</span><span className="kv__v">{proof.commissionBps / 100}%</span></div>
            <div className="kv__row"><span className="kv__k">Amount due</span><span className="kv__v">{proof.verifiedAmount.toFixed(6)} test FXRP</span></div>
            <div className="kv__row"><span className="kv__k">Recipient</span><span className="kv__v mono">{proof.creator}</span></div>
            <div className="kv__row"><span className="kv__k">Private record</span><span className="kv__v">Checked without being shown publicly</span></div>
          </div>
          <Link className="btn btn--tinted docs-cta" href="/app/inspector">See why this amount</Link>
        </div>

        <div className="panel">
          <div className="panel__title" style={{ marginBottom: 16 }}>What happened</div>
          <div className="kv">
            <div className="kv__row"><span className="kv__k">Money available</span><span className="kv__v">{proof.escrowAtSettlement.toFixed(6)} test FXRP</span></div>
            <div className="kv__row"><span className="kv__k">Amount missing</span><span className="kv__v">{proof.shortfall.toFixed(6)} test FXRP</span></div>
            <div className="kv__row"><span className="kv__k">Amount paid</span><span className="kv__v">{proof.totalSettled.toFixed(6)} test FXRP</span></div>
            <div className="kv__row"><span className="kv__k">Status</span><span className="kv__v">Stopped safely</span></div>
          </div>
        </div>
      </div>

      <div className="callout">
        <b>Next step:</b> add enough test FXRP to cover the amount due, run a new private check, then pay again.
      </div>

      <details className="panel">
        <summary className="panel__title">Technical proof</summary>
        <p className="panel__sub" style={{ marginTop: 10 }}>
          Optional details for judges and developers.
        </p>
        <div className="hero__actions" style={{ marginTop: 16 }}>
          <a className="btn btn--tinted" href={proof.instructionUrl} target="_blank" rel="noreferrer">Open private check on Flare</a>
          <a className="btn btn--tinted" href={proof.settlementUrl} target="_blank" rel="noreferrer">Open payment attempt on Flare</a>
          <a className="btn btn--tinted" href={proof.campaignUrl} target="_blank" rel="noreferrer">Open payment contract</a>
        </div>
      </details>
    </>
  );
}
