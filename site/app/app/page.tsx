import Link from "next/link";
import type { Metadata } from "next";
import {
  usd,
  ledgerSummary,
  gateSummary,
  invariant,
  payout,
  campaign,
  CATEGORY_LABEL,
  ledger,
} from "@/lib/evidence";

export const metadata: Metadata = {
  title: "Settlement dashboard",
  description:
    "The one eligible sale paid exact, the escrow left intact, and the proof gate green. Every figure read from Jorqeth's committed on-chain proof.",
};

export default function Dashboard() {
  const s = ledgerSummary();
  const gate = gateSummary();
  const inv = invariant();
  const { tx, balances } = payout();
  const camp = campaign();
  const rows = ledger();

  return (
    <>
      {/* headline: the one real payout */}
      <div className="dash-hero">
        <div className="dash-hero__main">
          <div className="dash-hero__eyebrow">Total settled to creator</div>
          <div className="dash-hero__amt">
            +{usd(balances.totalSettled)}<span className="u">mUSD</span>
          </div>
          <div className="dash-hero__row">
            <div className="dash-hero__stat">
              <b>{inv.paths_that_transferred_value} / {inv.paths_attempted}</b>
              <span>paths moved value</span>
            </div>
            <div className="dash-hero__stat">
              <b>block {tx.settleBlock}</b>
              <span>settle {tx.settleStatus}</span>
            </div>
            <div className="dash-hero__stat">
              <b>{camp.commissionBps / 100}%</b>
              <span>floor commission rule</span>
            </div>
          </div>
        </div>

        <div className="dash-hero__side">
          <div className="metric">
            <div className="metric__k">Proof gate</div>
            <div className="metric__v">{gate.checklistPassed} / {gate.checklistTotal}<span className="u">checks</span></div>
            <div className="metric__note">{gate.result} · {gate.forgePassed} forge tests green · {gate.privacyFindings} privacy findings</div>
          </div>
          <div className="metric">
            <div className="metric__k">Escrow remaining</div>
            <div className="metric__v">{usd(balances.escrowAfter)}<span className="u">mUSD</span></div>
            <div className="metric__note">From {usd(balances.escrowBefore)} funded, exactly one commission released.</div>
          </div>
        </div>
      </div>

      {/* outcome spread across the 12 paths */}
      <div className="panel" style={{ marginTop: 22 }}>
        <div className="panel__head">
          <div>
            <div className="panel__title">Outcome spread</div>
            <div className="panel__sub">Every one of the {s.total} tested paths, grouped by what it did.</div>
          </div>
          <Link className="link-row" href="/app/activity" style={{ marginTop: 0 }}>
            Full matrix <span className="arrow">→</span>
          </Link>
        </div>
        <div className="grid-3" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <div className="metric">
            <div className="metric__k">{CATEGORY_LABEL.paid}</div>
            <div className="metric__v">{s.paid}</div>
            <div className="metric__note">Value moved, once.</div>
          </div>
          <div className="metric">
            <div className="metric__k">{CATEGORY_LABEL.zero}</div>
            <div className="metric__v">{s.zero}</div>
            <div className="metric__note">Valid, terminal, pays nothing.</div>
          </div>
          <div className="metric">
            <div className="metric__k">{CATEGORY_LABEL.retry}</div>
            <div className="metric__v">{s.retry}</div>
            <div className="metric__note">Undecided, reverts, escrow intact.</div>
          </div>
          <div className="metric">
            <div className="metric__k">{CATEGORY_LABEL.reject}</div>
            <div className="metric__v">{s.reject}</div>
            <div className="metric__note">Guard or tamper blocked.</div>
          </div>
        </div>
      </div>

      {/* quick jump to the payable path + proof */}
      <div className="grid-2" style={{ marginTop: 22 }}>
        <div className="panel">
          <div className="panel__title">The eligible payout</div>
          <div className="panel__sub" style={{ marginBottom: 16 }}>
            One sale cleared every guard and released the exact commission.
          </div>
          {rows
            .filter((r) => r.category === "paid")
            .map((r) => (
              <div key={r.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
                <div>
                  <div className="t-title" style={{ fontWeight: 600 }}>{r.title}</div>
                  <div className="metric__note" style={{ marginTop: 4 }}>{r.plain}</div>
                </div>
                <span className="pill pill--paid"><span className="pd" />+{usd(r.amount)}</span>
              </div>
            ))}
          <Link className="link-row" href="/app/receipt">Open the receipt <span className="arrow">→</span></Link>
        </div>

        <div className="panel">
          <div className="panel__title">Why you can trust the number</div>
          <div className="panel__sub" style={{ marginBottom: 16 }}>
            Five independent sources are checked to agree, to the cent.
          </div>
          <div className="metric__note" style={{ fontSize: "var(--fs-sm)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Configured floor formula, the signed FCC result, the on-chain Settled event, the
            creator balance delta, and the escrow balance delta all equal {usd(balances.creatorDelta)} mUSD.
          </div>
          <Link className="link-row" href="/app/inspector">See the verification <span className="arrow">→</span></Link>
        </div>
      </div>

      <div className="callout" style={{ marginTop: 22 }}>
        <b>Testnet and synthetic data.</b> These are the committed proof figures from a local anvil
        run (chainId 31337) with a synthetic escrow token and records. The settlement invariant and
        the Flare signature scheme are real. A fully live production attestation round trip is the
        one remaining piece.
      </div>
    </>
  );
}
