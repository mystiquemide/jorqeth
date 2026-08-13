import Link from "next/link";
import type { Metadata } from "next";
import { usd, ledger, ledgerSummary, type Category } from "@/lib/evidence";
import { fxrpProof as proof } from "@/lib/fxrp-proof";

export const metadata: Metadata = {
  title: "Safety checks",
  description: "See what happened in the latest payment attempt and how Jorqeth protects payments.",
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

const FRIENDLY: Record<string, { title: string; plain: string }> = {
  eligible_positive: {
    title: "Valid sale",
    plain: "The sale qualified, so the exact commission was paid once.",
  },
  refund_ineligible: {
    title: "Refunded order",
    plain: "The order was refunded, so there was no commission to pay.",
  },
  infrastructure_unknown: {
    title: "Check unclear",
    plain: "Jorqeth could not get a clear answer, so it paid nothing and allowed another try.",
  },
  error_status: {
    title: "Check failed",
    plain: "The check did not finish correctly, so no money moved and it can be tried again.",
  },
  fleet_outage: {
    title: "Private check unavailable",
    plain: "The private checking service was unavailable, so the payment stayed untouched.",
  },
  wrong_domain_chain: {
    title: "Wrong network",
    plain: "The result belonged to a different network, so Jorqeth blocked it.",
  },
  wrong_domain_contract: {
    title: "Wrong payment",
    plain: "The result belonged to a different payment, so Jorqeth blocked it.",
  },
  untrusted_signer: {
    title: "Untrusted result",
    plain: "Jorqeth could not trust who approved the result, so it blocked the payment.",
  },
  tampered_amount: {
    title: "Amount changed",
    plain: "The amount no longer matched the approved result, so Jorqeth blocked it.",
  },
  tampered_creator: {
    title: "Recipient changed",
    plain: "The recipient no longer matched the approved result, so Jorqeth blocked it.",
  },
  expired: {
    title: "Old result",
    plain: "The approval was too old to use, so Jorqeth asked for a fresh check.",
  },
  replay: {
    title: "Already paid",
    plain: "The same approved order was used again, so Jorqeth blocked a second payment.",
  },
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
            <div className="panel__title">What Jorqeth protects you from</div>
            <div className="panel__sub">
              Jorqeth checks common failure cases before money can move.
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
                <th>What happened</th>
                <th className="num">Money moved</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const friendly = FRIENDLY[row.label] || { title: row.title, plain: row.plain };
                return (
                  <tr key={row.label}>
                    <td className="num" style={{ color: "var(--text-muted)" }}>{index + 1}</td>
                    <td>
                      <div className="t-title">{friendly.title}</div>
                      <div className="t-plain">{friendly.plain}</div>
                    </td>
                    <td>
                      <span className={`pill ${PILL[row.category]}`}><span className="pd" />{OUTCOME[row.category]}</span>
                    </td>
                    <td className="num" style={{ color: row.amount > 0 ? "var(--jade-deep)" : "var(--text-muted)" }}>
                      {row.amount > 0 ? `+${usd(row.amount)}` : usd(row.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="callout">
        <b>Simple rule:</b> Jorqeth pays only when the private check says money is due and every safety check passes. See <Link href="/app/inspector" style={{ color: "var(--jade-deep)" }}>why this amount</Link> for the latest payment.
      </div>
    </>
  );
}
