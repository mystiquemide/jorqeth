import Link from "next/link";
import type { Metadata } from "next";
import { usd, ledger, ledgerSummary, type Category } from "@/lib/evidence";
import { fxrpProof as proof } from "@/lib/fxrp-proof";

export const metadata: Metadata = {
  title: "Safety checks",
  description: "See what happened in the latest payment attempt and how Jorqeth blocks unsafe payments.",
};

const PILL: Record<Category, string> = {
  paid: "pill--paid",
  zero: "pill--zero",
  retry: "pill--retry",
  reject: "pill--reject",
};

const OUTCOME: Record<Category, string> = {
  paid: "Paid",
  zero: "Nothing due",
  retry: "Try again",
  reject: "Blocked",
};

export default function Activity() {
  const rows = ledger();
  const summary = ledgerSummary();

  return (
    <>
      <div className="crumb">
        <Link href="/app">Pay commission</Link> <span>/</span> Safety checks
      </div>

      <div className="panel">
        <div className="panel__head">
          <div>
            <div className="panel__title">Latest payment attempt</div>
            <div className="panel__sub">
              Jorqeth checked that {proof.verifiedAmount.toFixed(0)} test FXRP was due, but only {proof.escrowAtSettlement.toFixed(0)} test FXRP was available. Nothing was paid.
            </div>
          </div>
          <span className="pill pill--retry"><span className="pd" />Stopped safely</span>
        </div>

        <div className="grid-4" style={{ marginBottom: 22 }}>
          <div className="metric"><div className="metric__k">Amount due</div><div className="metric__v">{proof.verifiedAmount}</div></div>
          <div className="metric"><div className="metric__k">Money available</div><div className="metric__v">{proof.escrowAtSettlement}</div></div>
          <div className="metric"><div className="metric__k">Amount missing</div><div className="metric__v">{proof.shortfall}</div></div>
          <div className="metric"><div className="metric__k">Amount paid</div><div className="metric__v">{proof.totalSettled}</div></div>
        </div>

        <div className="callout">
          Add enough test FXRP to cover the amount due, run a new private check, then try the payment again.
        </div>

        <details style={{ marginTop: 16 }}>
          <summary>Technical details</summary>
          <div className="hero__actions" style={{ marginTop: 14 }}>
            <a className="btn btn--tinted" href={proof.instructionUrl} target="_blank" rel="noreferrer">Open check on Flare</a>
            <a className="btn btn--tinted" href={proof.settlementUrl} target="_blank" rel="noreferrer">Open payment attempt on Flare</a>
          </div>
        </details>
      </div>

      <div className="panel">
        <div className="panel__head">
          <div>
            <div className="panel__title">What Jorqeth refuses to pay</div>
            <div className="panel__sub">
              These tests make sure a bad, changed, repeated, expired, or uncertain result cannot move money.
            </div>
          </div>
        </div>

        <div className="grid-4" style={{ marginBottom: 22 }}>
          {(["paid", "zero", "retry", "reject"] as Category[]).map((category) => (
            <div className="metric" key={category}>
              <div className="metric__k">{OUTCOME[category]}</div>
              <div className="metric__v">{summary[category]}</div>
            </div>
          ))}
        </div>

        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 34 }}>#</th>
                <th>Situation</th>
                <th>What Jorqeth did</th>
                <th className="num">Money moved</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.label}>
                  <td className="num" style={{ color: "var(--text-muted)" }}>{index + 1}</td>
                  <td>
                    <div className="t-title">{row.title}</div>
                    <div className="t-plain">{row.plain}</div>
                  </td>
                  <td>
                    <span className={`pill ${PILL[row.category]}`}><span className="pd" />{OUTCOME[row.category]}</span>
                  </td>
                  <td className="num" style={{ color: row.amount > 0 ? "var(--jade-deep)" : "var(--text-muted)" }}>
                    {row.amount > 0 ? `+${usd(row.amount)}` : usd(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="callout">
        <b>Simple rule:</b> Jorqeth only pays when the private check says money is due and every safety check passes. See <Link href="/app/inspector" style={{ color: "var(--jade-deep)" }}>why this amount</Link> for the latest payment.
      </div>
    </>
  );
}
