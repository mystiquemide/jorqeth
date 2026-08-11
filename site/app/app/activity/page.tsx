import Link from "next/link";
import type { Metadata } from "next";
import { usd, ledger, ledgerSummary, invariant, CATEGORY_LABEL, type Category } from "@/lib/evidence";

export const metadata: Metadata = {
  title: "Settlement matrix",
  description:
    "All twelve tested settlement paths in one view. One paid the exact commission, every other path settled to zero.",
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
            <div className="panel__title">Every path, one outcome each</div>
            <div className="panel__sub">
              {inv.paths_attempted} paths attempted, {inv.paths_that_transferred_value} moved value.
              This is the committed negative proof, in full.
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
                    {r.amount > 0 ? `+${usd(r.amount)}` : usd(r.amount)}
                  </td>
                  <td><span className="t-err">{r.error === "none" ? "-" : r.error}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="callout">
        <b>Only the eligible path paid.</b> Creator final {usd(inv.creator_final)} mUSD, escrow final{" "}
        {usd(inv.escrow_final)} mUSD, total settled {usd(inv.total_settled)} mUSD. Refunds settle at
        zero, undecided and error results stay retryable with escrow intact, and every tamper or
        wrong-domain case is rejected at the boundary. Walk the checks on the{" "}
        <Link href="/app/inspector" style={{ color: "var(--jade-deep)" }}>proof inspector</Link>.
      </div>
    </>
  );
}
