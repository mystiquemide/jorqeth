import Link from "next/link";
import type { Metadata } from "next";
import { fxrpProof as proof } from "@/lib/fxrp-proof";

export const metadata: Metadata = {
  title: "FXRP settlement receipt",
  description:
    "Inspect the latest Jorqeth FXRP verification and settlement attempt on Flare Testnet Coston2.",
};

function short(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export default function Receipt() {
  return (
    <>
      <div className="crumb">
        <Link href="/app">Dashboard</Link> <span>/</span> FXRP settlement receipt
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
              {proof.verifiedAmount.toFixed(6)}<span className="u">test FXRP verified</span>
            </div>
            <div className="payout-hero__meta">
              <span className="pill pill--retry"><span className="pd" />Not paid</span>
              <span>Settlement tx reverted in block {proof.settlement.blockNumber.toLocaleString("en-US")}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="callout">
        <b>The private verification succeeded, but no FXRP payout moved.</b> The signed FCE result
        requested {proof.verifiedAmount.toFixed(6)} test FXRP while the campaign held only{" "}
        {proof.escrowAtSettlement.toFixed(6)} test FXRP. The settlement transaction reverted and
        the campaign still reports {proof.totalSettled.toFixed(6)} total FXRP settled.
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel__title" style={{ marginBottom: 16 }}>Private verification</div>
          <div className="kv">
            <div className="kv__row"><span className="kv__k">Status</span><span className="kv__v">Success</span></div>
            <div className="kv__row"><span className="kv__k">Verified amount</span><span className="kv__v mono">{proof.verifiedAmount.toFixed(6)} test FXRP</span></div>
            <div className="kv__row"><span className="kv__k">Commission rule</span><span className="kv__v">{proof.commissionBps / 100}%</span></div>
            <div className="kv__row"><span className="kv__k">Instruction ID</span><span className="kv__v mono">{proof.instruction.id}</span></div>
            <div className="kv__row"><span className="kv__k">Verification tx</span><span className="kv__v mono">{short(proof.instruction.transaction)}</span></div>
            <div className="kv__row"><span className="kv__k">Block</span><span className="kv__v mono">{proof.instruction.blockNumber.toLocaleString("en-US")}</span></div>
          </div>
          <a className="btn btn--primary docs-cta" href={proof.instructionUrl} target="_blank" rel="noreferrer">
            Open verification on Coston2
          </a>
        </div>

        <div className="panel">
          <div className="panel__title" style={{ marginBottom: 16 }}>Settlement state</div>
          <div className="kv">
            <div className="kv__row"><span className="kv__k">Transaction</span><span className="kv__v mono">{short(proof.settlement.transaction)}</span></div>
            <div className="kv__row"><span className="kv__k">Receipt</span><span className="kv__v">Reverted</span></div>
            <div className="kv__row"><span className="kv__k">Campaign escrow</span><span className="kv__v mono">{proof.escrowAtSettlement.toFixed(6)} test FXRP</span></div>
            <div className="kv__row"><span className="kv__k">Verified payout</span><span className="kv__v mono">{proof.verifiedAmount.toFixed(6)} test FXRP</span></div>
            <div className="kv__row"><span className="kv__k">Funding shortfall</span><span className="kv__v mono">{proof.shortfall.toFixed(6)} test FXRP</span></div>
            <div className="kv__row"><span className="kv__k">Total settled</span><span className="kv__v mono">{proof.totalSettled.toFixed(6)} test FXRP</span></div>
          </div>
          <a className="btn btn--tinted docs-cta" href={proof.settlementUrl} target="_blank" rel="noreferrer">
            Open reverted settlement
          </a>
        </div>
      </div>

      <div className="panel">
        <div className="panel__title" style={{ marginBottom: 16 }}>Bound to the live FXRP campaign</div>
        <div className="kv">
          <div className="kv__row"><span className="kv__k">Campaign</span><span className="kv__v mono">{proof.campaign}</span></div>
          <div className="kv__row"><span className="kv__k">FTestXRP token</span><span className="kv__v mono">{proof.token}</span></div>
          <div className="kv__row"><span className="kv__k">FCE verifier</span><span className="kv__v mono">{proof.verifier}</span></div>
          <div className="kv__row"><span className="kv__k">Creator</span><span className="kv__v mono">{proof.creator}</span></div>
          <div className="kv__row"><span className="kv__k">Order digest</span><span className="kv__v mono">{proof.orderDigest}</span></div>
          <div className="kv__row"><span className="kv__k">Chain</span><span className="kv__v">Coston2 · {proof.chainId}</span></div>
        </div>
        <a className="btn btn--tinted docs-cta" href={proof.campaignUrl} target="_blank" rel="noreferrer">
          Open campaign on Coston2
        </a>
      </div>

      <div className="callout">
        This page now reflects the latest live FXRP attempt. The older successful mUSD FCE run is
        retained separately on the <Link href="/proof" style={{ color: "var(--jade-deep)" }}>completed proof page</Link>{" "}
        until a successful FXRP settlement replaces it.
      </div>
    </>
  );
}
