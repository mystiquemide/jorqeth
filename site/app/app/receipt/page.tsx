import Link from "next/link";
import type { Metadata } from "next";
import { usd, payout, deployment, amountAgreement, campaign, invariant } from "@/lib/evidence";

export const metadata: Metadata = {
  title: "Payout receipt",
  description:
    "The real settled commission, block and transaction, with five independent amount sources shown agreeing to the cent.",
};

export default function Receipt() {
  const { order, tx, balances } = payout();
  const d = deployment();
  const agree = amountAgreement();
  const camp = campaign();
  const inv = invariant();

  return (
    <>
      <div className="crumb">
        <Link href="/app">Dashboard</Link> <span>/</span> Payout receipt
      </div>

      {/* the payout */}
      <div className="panel">
        <div className="payout-hero">
          <div className="payout-hero__badge">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="payout-hero__amt">
              +{usd(balances.creatorDelta)}<span className="u">mUSD</span>
            </div>
            <div className="payout-hero__meta">
              <span className="pill pill--paid"><span className="pd" />Paid, once</span>
              <span>Settled in block {tx.settleBlock} · {tx.settleStatus} · {tx.settleGasUsed.toLocaleString("en-US")} gas</span>
            </div>
          </div>
        </div>
      </div>

      {/* five sources agree */}
      <div className="panel">
        <div className="panel__head">
          <div>
            <div className="panel__title">Exact to the cent</div>
            <div className="panel__sub">Five independent sources, one number. This is what &ldquo;exact&rdquo; means.</div>
          </div>
        </div>
        <div className="agree">
          {agree.sources.map((src) => (
            <div className="agree__row" key={src.label}>
              <span className="agree__label">{src.label}</span>
              <span className="agree__val">
                {usd(src.value)}
                <span className="agree__check">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
              </span>
            </div>
          ))}
        </div>
        {agree.allEqual && (
          <div className="agree__foot">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            All five agree. floor({usd(agree.netApplied)} × {agree.commissionBps / 100}%) resolves to exactly {usd(balances.creatorDelta)} mUSD.
          </div>
        )}
      </div>

      {/* on-chain facts */}
      <div className="grid-2">
        <div className="panel">
          <div className="panel__title" style={{ marginBottom: 16 }}>Settlement</div>
          <div className="kv">
            <div className="kv__row"><span className="kv__k">Eligibility</span><span className="kv__v">{order.eligibility}</span></div>
            <div className="kv__row"><span className="kv__k">Order digest</span><span className="kv__v mono">{order.orderDigest}</span></div>
            <div className="kv__row"><span className="kv__k">Settle tx</span><span className="kv__v mono">{tx.settle}</span></div>
            <div className="kv__row"><span className="kv__k">Fund tx</span><span className="kv__v mono">{tx.fund}</span></div>
            <div className="kv__row"><span className="kv__k">Order settled</span><span className="kv__v">{balances.orderSettled ? "Yes, terminal" : "No"}</span></div>
          </div>
        </div>

        <div className="panel">
          <div className="panel__title" style={{ marginBottom: 16 }}>Balances moved</div>
          <div className="kv">
            <div className="kv__row"><span className="kv__k">Escrow before</span><span className="kv__v mono">{usd(balances.escrowBefore)} mUSD</span></div>
            <div className="kv__row"><span className="kv__k">Escrow after</span><span className="kv__v mono">{usd(balances.escrowAfter)} mUSD</span></div>
            <div className="kv__row"><span className="kv__k">Creator before</span><span className="kv__v mono">{usd(balances.creatorBefore)} mUSD</span></div>
            <div className="kv__row"><span className="kv__k">Creator after</span><span className="kv__v mono">{usd(balances.creatorAfter)} mUSD</span></div>
            <div className="kv__row"><span className="kv__k">Total settled</span><span className="kv__v mono">{usd(balances.totalSettled)} mUSD</span></div>
          </div>
        </div>
      </div>

      {/* contracts / rule */}
      <div className="panel">
        <div className="panel__title" style={{ marginBottom: 16 }}>Bound to this deployment and rule</div>
        <div className="kv">
          <div className="kv__row"><span className="kv__k">Rule</span><span className="kv__v">{camp.rounding.formula}</span></div>
          <div className="kv__row"><span className="kv__k">Campaign</span><span className="kv__v">{camp.campaignLabel} · {camp.commissionBps / 100}% floor</span></div>
          <div className="kv__row"><span className="kv__k">Settlement contract</span><span className="kv__v mono">{d.settlement}</span></div>
          <div className="kv__row"><span className="kv__k">Escrow token</span><span className="kv__v mono">{d.escrowToken}</span></div>
          <div className="kv__row"><span className="kv__k">Creator</span><span className="kv__v mono">{d.creator}</span></div>
          <div className="kv__row"><span className="kv__k">FCC verifier</span><span className="kv__v mono">{d.fccVerifier}</span></div>
          <div className="kv__row"><span className="kv__k">Verifier mode</span><span className="kv__v">{d.verifierMode}</span></div>
        </div>
      </div>

      <div className="callout">
        <b>One eligible path of {inv.paths_attempted}.</b> Every other tested path, refund, replay,
        tampering, wrong chain, expiry, or an undecided result, paid zero. See how each one is caught on
        the <Link href="/app/activity" style={{ color: "var(--jade-deep)" }}>settlement matrix</Link>.
      </div>
    </>
  );
}
