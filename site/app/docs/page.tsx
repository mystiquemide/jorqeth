import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import SkipLink from "@/components/SkipLink";

export const metadata: Metadata = {
  title: "How Jorqeth works on Flare",
  description:
    "How Jorqeth uses Flare Confidential Compute and Coston2 to privately evaluate merchant records and settle exact creator and affiliate commissions.",
};

const STEPS = [
  ["Connect to Flare Coston2", "Use an injected EVM wallet and switch to Coston2, chain 114."],
  ["Choose the recipient", "Set the creator or affiliate wallet that the campaign can pay."],
  ["Fix the rule", "Create a campaign with the agreed commission percentage and settlement window."],
  ["Fund escrow on Flare", "Add test mUSD and lock the payout budget in the Coston2 campaign."],
  ["Enter the agreed reference", "Use the private order reference agreed with the merchant. The underlying record does not enter the browser or chain."],
  ["Evaluate with Flare Confidential Compute", "Jorqeth sends the request through FCE. The private merchant record stays inside the evaluation runtime and only the payout result returns."],
  ["Verify the signed result", "Jorqeth checks the Flare result against the active TEE set before any escrow can move."],
  ["Settle exactly once", "The campaign releases the exact commission on Coston2 and closes the order digest against replay."],
] as const;

export default function Docs() {
  return (
    <>
      <SkipLink />
      <SiteNav />
      <main id="main" className="legal" tabIndex={-1}>
        <div className="container legal__wrap">
          <Link className="legal__crumb" href="/">
            <span className="arrow">→</span> Back to Jorqeth
          </Link>

          <span className="eyebrow">Powered by Flare Confidential Compute</span>
          <h1>How Jorqeth settles a private commission</h1>
          <p className="legal__lede">
            Jorqeth binds a commission rule, payout wallet, private evaluation, and escrow to one
            campaign. Flare Confidential Compute privately checks the agreed merchant record, then
            the exact verified commission settles on Coston2.
          </p>

          <section>
            <h2>The settlement journey</h2>
            <ol className="docs-steps">
              {STEPS.map(([title, detail], index) => (
                <li key={title}>
                  <span>{index + 1}</span>
                  <div><b>{title}</b><p>{detail}</p></div>
                </li>
              ))}
            </ol>
            <Link className="btn btn--primary docs-cta" href="/app">Open Jorqeth</Link>
          </section>

          <section>
            <h2>Why Flare is part of the trust model</h2>
            <p>
              Flare is not a cosmetic settlement network in Jorqeth&apos;s primary path. Coston2
              hosts the campaign escrow and settlement contracts. Flare Confidential Compute runs
              the private evaluation, and the active TEE set anchors which signed results Jorqeth
              can accept before a payout moves.
            </p>
          </section>

          <section>
            <h2>What is live now</h2>
            <p>
              The hosted app is connected to the public FCE result bridge. It can create a
              campaign, fund escrow, dispatch a private evaluation, receive the signed result,
              verify it on-chain, settle the exact payout, and confirm that the same order cannot
              pay twice.
            </p>
            <p>
              A completed hosted run paid exactly 20 mUSD from a 100 mUSD test campaign, left 80
              mUSD in escrow, and rejected replay. Inspect the <Link className="legal__inline" href="/proof">live Flare proof</Link> for the FCE instruction and settlement transactions.
            </p>
          </section>

          <section>
            <h2>Current confidential-compute boundary</h2>
            <p>
              The Coston2 runtime uses Flare&apos;s supported simulated-TEE testnet mode. The active
              TEE evaluates the configured private merchant record inside the Jorqeth extension and
              returns only the minimum domain-bound result required for settlement. Jorqeth&apos;s
              verifier accepts the result only when its recovered signer belongs to the active TEE
              set for the registered extension.
            </p>
            <p>
              This is a real FCE testnet lifecycle, but it is not hardware-backed production
              attestation. Production deployment still requires measured confidential-space
              attestation, confidential credential delivery, a real commerce connector, and
              operational monitoring.
            </p>
            <p>
              The disclosed-signer route remains available separately at <Link className="legal__inline" href="/app/demo">/app/demo</Link> as a fallback test flow. It is not the primary product path.
            </p>
          </section>

          <section>
            <h2>What becomes public</h2>
            <ul>
              <li>The campaign contract and wallet addresses.</li>
              <li>The exact commission amount and settlement transaction.</li>
              <li>An opaque order digest used to stop repeat payouts.</li>
              <li>The signed result fields required for verification.</li>
            </ul>
            <p>
              Customer details, the full sales ledger, and the underlying private merchant record
              remain outside the public chain. Read the full boundary on the <Link className="legal__inline" href="/privacy">privacy page</Link>.
            </p>
          </section>

          <section>
            <h2>If the flow stops</h2>
            <ul>
              <li><b>No wallet found.</b> Install or open an EVM wallet such as MetaMask.</li>
              <li><b>Wrong network.</b> Approve the request to add or switch to Flare Coston2.</li>
              <li><b>Not enough gas.</b> Add a small amount of C2FLR from a Coston2 faucet, then retry.</li>
              <li><b>Private verification unavailable.</b> No payout is made. Try the private check again when the service is ready.</li>
              <li><b>Record not found.</b> Check the exact reference agreed with the merchant.</li>
              <li><b>Expired result.</b> Run the private evaluation again to obtain a fresh result.</li>
            </ul>
          </section>

          <section>
            <h2>Evidence</h2>
            <p>
              Start with the <Link className="legal__inline" href="/proof">live hosted proof</Link>.
              The repository also includes the deterministic <Link className="legal__inline" href="/app/receipt">reference receipt</Link>, <Link className="legal__inline" href="/app/activity">failure matrix</Link>, and <Link className="legal__inline" href="/app/inspector">verification checks</Link> used to exercise settlement invariants.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
