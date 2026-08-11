import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import SkipLink from "@/components/SkipLink";

export const metadata: Metadata = {
  title: "Terms of use",
  description:
    "The terms for using Jorqeth on Flare Testnet Coston2. No real funds, no warranty.",
};

const UPDATED = "August 2026";

export default function Terms() {
  return (
    <>
      <SkipLink />
      <SiteNav />

      <main id="main" className="legal" tabIndex={-1}>
        <div className="container legal__wrap">
          <Link className="legal__crumb" href="/">
            <span className="arrow">→</span> Back to Jorqeth
          </Link>

          <h1>Terms of use</h1>
          <p className="legal__meta">Last updated {UPDATED}</p>

          <p className="legal__lede">
            Jorqeth is a working demo of private, exact commission settlement. You can connect a
            wallet, fund an escrow, run an evaluation, and settle a payout on-chain. These terms
            cover what that means and what it doesn&apos;t.
          </p>

          <p className="legal__note">
            <b>This is a testnet demo, not a financial product.</b> It uses Flare&apos;s Coston2
            test network and test tokens with no cash value. Nothing here settles
            real money, and you should never send real funds to any address you see in this app.
          </p>

          <section>
            <h2>What Jorqeth does</h2>
            <p>
              Jorqeth reads an agreed private sales record, works out the exact commission a
              creator or affiliate is owed, and settles that amount once on-chain. The rule is
              fixed and public: commission equals the net sale amount times the agreed rate,
              rounded down. Every payout is checked against a signed result before any value moves,
              and the same order can never pay twice.
            </p>
          </section>

          <section>
            <h2>Testnet value</h2>
            <ul>
              <li>
                <b>No real funds.</b> Escrow, payouts, and balances use test tokens on Coston2.
                They can&apos;t be redeemed, sold, or converted to anything of value.
              </li>
              <li>
                <b>Test wallets only.</b> Connect a wallet you use for testing. Don&apos;t connect a
                wallet that holds real assets.
              </li>
              <li>
                <b>The network can reset.</b> Coston2 is a public test network. Balances, contracts,
                and history may be wiped or become unavailable at any time, and that&apos;s expected.
              </li>
            </ul>
          </section>

          <section>
            <h2>The confidential step</h2>
            <p>
              In production, the commission evaluation runs inside Flare Confidential Compute so the
              sales record stays sealed and the result is signed by attested hardware. In this demo,
              the evaluation logic is the real one, but the attestation is simulated by a local
              signer. We label this everywhere it appears. A full production attestation round trip
              is the one piece still in progress, and we don&apos;t claim otherwise.
            </p>
          </section>

          <section>
            <h2>Your responsibilities</h2>
            <ul>
              <li>You control your wallet and its keys. We never see or hold them.</li>
              <li>You approve every transaction yourself before it&apos;s sent.</li>
              <li>
                You use the demo as intended and don&apos;t try to attack, overload, or abuse the
                contracts or the hosting.
              </li>
            </ul>
          </section>

          <section>
            <h2>No warranty</h2>
            <p>
              Jorqeth is provided as-is, for evaluation and demonstration. It comes with no
              warranty of any kind, and it may have bugs, downtime, or incomplete features. To the
              extent the law allows, we aren&apos;t liable for any loss arising from your use of the
              demo. Since it moves no real value, there&apos;s nothing of monetary value to lose here.
            </p>
          </section>

          <section>
            <h2>The code is open</h2>
            <p>
              The contracts, evaluator, and proofs are public. If you want to know exactly how a
              payout is calculated and enforced, read the source rather than take our word for it.
              You can find it on{" "}
              <a
                className="legal__inline"
                href="https://github.com/mystiquemide/jorqeth"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
              .
            </p>
          </section>

          <section>
            <h2>Changes</h2>
            <p>
              We may update these terms as the demo evolves. The date at the top shows the last
              change. Continuing to use the app after an update means you accept the current terms.
            </p>
          </section>

          <p className="legal__contact">
            Questions about these terms? Open an issue on the{" "}
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
