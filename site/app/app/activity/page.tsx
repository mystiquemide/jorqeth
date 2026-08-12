import Link from "next/link";
import type { Metadata } from "next";
import { usd, ledger, ledgerSummary, invariant, CATEGORY_LABEL, type Category } from "@/lib/evidence";
import { fxrpProof as proof } from "@/lib/fxrp-proof";

export const metadata: Metadata = {
  title: "Settlement matrix",
  description:
    "Inspect the latest live FXRP attempt alongside Jorqeth's deterministic negative-path settlement regression matrix.",
};

const PILL: Record<Category, string> = {
  paid: "pill--paid",
  zero: "pill--zero",
  retry: "pill--retry",
  reject: "pill--reject",
};

export default function Activity() {
  const rows = ledger();
  const s = ledgerSummary();
  const inv = invariant();

  return (
    <>
      <div className="crumb">
        <Link href="/app">Dashboard</Link> <span>/</span> Settlement matrix
      </div>

      <div className="panel">
        <div className="panel__head">
          <div>
            <div className="panel__title">Latest live FXRP attempt</div>
            <div className="panel__sub">
              The private FCE verification succeeded for {proof.verifiedAmount.toFixed(6)} test FXRP. The payout transaction reverted, so no FXRP was counted as settled.
            </div>
          </div>
          <span className="pill pill--retry"><span className="pd" />No payout moved</span>
        </div>

        <div className="grid-4" style={{ marginBottom: 22 }}>
          <div className="metric"><div className="metric__k">Verified payout</div><div className="metric__v">{proof.verifiedAmount}</div></div>
          <div className="metric"><div className="metric__k">Escrow available</div><div className="metric__v">{proof.escrowAtSettlement}</div></div>
          <div className="metric"><div className="metric__k">Shortfall</div><div className="metric__v">{proof.shortfall}</div></div>
          <div className="metric"><div className="metric__k">Total settled</div><div className="metric__v">{proof.totalSettled}</div></div>
        </div>

        <div className="kv">
          <div className="kv__row"><span className="kv__k">Campaign</span><span className="kv__v mono">{proof.campaign}</span></div>
          <div className="kv__row"><span className="kv__k">Verification tx</span><span className="kv__v mono">{proof.instruction.transaction}</span></div>
          <div className="kv__row"><span className="kv__k">Settlement tx</span><span className="kv__v mono">{proof.settlement.transaction}</span></div>
          <div className="kv__row"><span className="kv__k">Settlement receipt</span><span className="kv__v">Reverted</span></div>
        </div>
      </div>

      <div className="panel">
        <div className="panel__head">
          <div>
            <div className="panel__title">Deterministic settlement regression matrix</div>
            <div className="panel__sub">
              {inv.paths_attempted} local contract paths attempted, {inv.paths_that_transferred_value} moved value. These are regression vectors, not the live FXRP transaction history above.
            </div>
          </div>
        </div>

        <div className="grid-4" style={{ marginBottom: 22 }}>
          {(["paid", "zero", "retry", "reject"] as Category[]).map((c) => (
            <div className="metric" key={c}>
              <div className="metric__k">{CATEGORY_LABEL[c]}</div>
              <div className="metric__v">{s[c]}</div>
            </div>
          ))}
        </div>

        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 34 }}>#</th>
                <th>Path</th>
                <th>Outcome</th>
                <th className="num">Creator delta</th>
                <th>Reverts with</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label}>
                  <td className="num" style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                  <td>
                    <div className="t-title">{r.title}</div>
                    <div className="t-plain">{r.plain}</div>
                  </td>
                  <td>
                    <span className={`pill ${PILL[r.category]}`}><span className="pd" />{CATEGORY_LABEL[r.category]}</span>
                  </td>
                  <td className="num" style={{ color: r.amount > 0 ? "var(--jade-deep)" : "var(--text-muted)" }}>
                    {r.amount > 0 ? `+${usd(r.amount)}` : usd(r.amount)} test units
                  </td>
                  <td><span className="t-err">{r.error === "none" ? "-" : r.error}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="callout">
        <b>The two sections prove different things.</b> The top section is the real Coston2 FXRP attempt. The matrix is the committed local regression suite showing that refund, replay, tampering, wrong-domain, expiry, and undecided paths fail closed. Inspect the live FCE fields on the{" "}
        <Link href="/app/inspector" style={{ color: "var(--jade-deep)" }}>verification details</Link>.
      </div>
    </>
  );
}
