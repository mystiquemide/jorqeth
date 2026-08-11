import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import SkipLink from "@/components/SkipLink";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Jorqeth keeps private and what it puts on-chain. The sales record never leaves the confidential step. Only the exact payout is public.",
};

const UPDATED = "August 2026";

export default function Privacy() {
  return (
    <>
      <SkipLink />
      <SiteNav />

      <main id="main" className="legal" tabIndex={-1}>
        <div className="container legal__wrap">
          <Link className="legal__crumb" href="/">
            <span className="arrow">→</span> Back to Jorqeth
          </Link>

          <h1>Privacy</h1>
          <p className="legal__meta">Last updated {UPDATED}</p>

          <p className="legal__lede">
            Privacy is the whole point of Jorqeth. The merchant&apos;s sales record stays sealed
            inside the confidential step, and the only thing that ever reaches the chain is the
            exact payout owed. Here&apos;s the line between what stays private and what goes public.
          </p>

          <section>
            <h2>What stays private</h2>
            <ul>
              <li>
                <b>The sales record.</b> Order values, buyer details, refunds, and the full ledger
                never leave the confidential step. The chain never sees them.
              </li>
              <li>
                <b>The math behind the number.</b> How each order was classified and why it did or
                didn&apos;t earn commission stays inside the evaluation. Only the final amount comes out.
              </li>
              <li>
                <b>Everyone else&apos;s payouts.</b> Settling your commission reveals your amount, not
                anyone else&apos;s, and not the total the merchant sold.
              </li>
            </ul>
          </section>

          <section>
            <h2>What goes on-chain</h2>
            <p>
              A public blockchain is public by design. When a payout settles, these become
              permanent and visible to anyone:
            </p>
            <ul>
              <li><b>The exact commission amount</b> that was paid.</li>
              <li><b>The creator address</b> that received it.</li>
              <li>
                <b>A one-way fingerprint of the order</b> (a hash), which proves that order settled
                exactly once without revealing what the order was.
              </li>
              <li><b>The escrow balance</b> and the running total settled for the campaign.</li>
            </ul>
          </section>

          <section>
            <h2>Private in, proven out</h2>
            <div className="legal__split" role="table" aria-label="What stays private versus what is public">
              <div className="legal__split-row legal__split-head" role="row">
                <div className="legal__split-cell" role="columnheader">Stays private</div>
                <div className="legal__split-cell" role="columnheader">Public on-chain</div>
              </div>
              <div className="legal__split-row" role="row">
                <div className="legal__split-cell" role="cell">
                  <span className="k">Full sales ledger</span>
                  Every order, value, and buyer
                </div>
                <div className="legal__split-cell" role="cell">
                  <span className="k">One payout amount</span>
                  The exact commission owed
                </div>
              </div>
              <div className="legal__split-row" role="row">
                <div className="legal__split-cell" role="cell">
                  <span className="k">Order contents</span>
                  What each order actually was
                </div>
                <div className="legal__split-cell" role="cell">
                  <span className="k">Order fingerprint</span>
                  A hash that proves paid-once
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2>Your wallet</h2>
            <p>
              When you connect a wallet, the app reads its public address to show your balance and
              build transactions for you to approve. We never ask for or store your private keys,
              and we can&apos;t move funds on your behalf. You sign every transaction yourself.
            </p>
            <p>
              Because this runs on the public Coston2 test network, your wallet address and the
              transactions you send are visible on the network explorer, the same as any other
              on-chain activity.
            </p>
          </section>

          <section>
            <h2>What we collect</h2>
            <ul>
              <li>
                <b>No accounts.</b> There&apos;s no sign-up, no email, and no profile. You just connect
                a wallet.
              </li>
              <li>
                <b>No sales data.</b> The demo works from a fixed synthetic record. We don&apos;t upload
                or store any real merchant data.
              </li>
              <li>
                <b>Standard hosting logs.</b> The host may keep basic request logs (like IP and
                timestamp) for security and reliability, the same as any website.
              </li>
            </ul>
          </section>

          <section>
            <h2>Third parties</h2>
            <p>
              To connect a wallet and read the chain, the app talks to your wallet extension and to
              a Coston2 RPC endpoint. Those services see the requests your browser makes to them.
              We don&apos;t sell or share data, because we don&apos;t collect any to begin with.
            </p>
          </section>

          <p className="legal__contact">
            Questions about privacy? Open an issue on the{" "}
            <a
              className="legal__inline"
              href="https://github.com/mystiquemide/jorqeth"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub repository
            </a>
            .
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
