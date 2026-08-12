import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import SkipLink from "@/components/SkipLink";

export const metadata: Metadata = {
  title: "How Jorqeth works on Flare",
  description:
    "How Jorqeth uses Flare Confidential Compute and Coston2 to evaluate private merchant records and settle exact creator commissions on-chain.",
};

const STEPS = [
  ["Connect to Flare Coston2", "Use an injected EVM wallet and switch to Coston2, chain 114."],
  ["Choose the recipient", "Set the creator or affiliate wallet that the campaign can pay."],
  ["Fix the rule", "Create an FCE-bound campaign with a commission percentage and seven-day end time."],
  ["Fund escrow on Flare", "Mint test mUSD, approve the campaign, and lock the payout budget on Coston2."],
  ["Enter the agreed reference", "Use the merchant record reference. Jorqeth hashes it before the FCE request."],
  ["Evaluate with Flare Confidential Compute", "Jorqeth sends the request through FCE to a registered active TEE. The private merchant record stays inside the extension runtime."],
  ["Verify the Flare ActionResult", "FccResultVerifier checks the signed result against the active TEE set before any escrow can move."],
  ["Settle exactly once", "The campaign releases the exact commission on Coston2 and permanently closes the order digest against replay."],
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

          <h1>How Jorqeth works on Flare</h1>
          <p className="legal__lede">
            Jorqeth is a private commission settlement app built on Flare. It binds a payout
            rule, creator wallet, private FCE evaluation, and escrow to one campaign, then settles
            the exact result on Coston2 only after the Flare TEE signature is verified.
          </p>

          <section>
            <h2>The Flare-native settlement journey</h2>
            <ol className="docs-steps">
              {STEPS.map(([title, detail], index) => (
                <li key={title}>
                  <span>{index + 1}</span>
                  <div><b>{title}</b><p>{detail}</p></div>
                </li>
              ))}
            </ol>
            <Link className="btn btn--primary docs-cta" href="/app">Run with Flare FCE</Link>
          </section>

          <section>
            <h2>Why Flare is part of the trust model</h2>
            <p>
              Flare is not a cosmetic settlement network in Jorqeth&apos;s primary path. Coston2
              hosts the campaign escrow and settlement contracts, Flare FCE routes the private
              evaluation to a registered TEE, and the MachineManager active set is used to
              authenticate the signer before the payout can move.
            </p>
          </section>

          <section>
            <h2>What is live on Coston2</h2>
            <p>
              The primary app can create an FCE-bound campaign, fund escrow, dispatch a Jorqeth
              evaluation through Flare Confidential Compute, retrieve the signed TEE ActionResult,
              verify it on-chain, settle the exact payout, and check the paid-once guard. The
              committed proof bundle records the same FCE lifecycle and a completed settlement.
            </p>
          </section>

          <section>
            <h2>Current confidential-compute boundary</h2>
            <p>
              The current Coston2 FCE proof uses Flare&apos;s supported simulated-TEE testnet mode.
              The active TEE evaluates the configured private merchant record inside the Jorqeth
              extension and returns only the minimum domain-bound result required for settlement.
              FccResultVerifier reconstructs the Flare ActionResult signing hash and accepts the
              result only when the recovered signer belongs to the active TEE set for Jorqeth&apos;s
              registered extension.
            </p>
            <p>
              This is a real FCE testnet path, but it is not hardware-backed production
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
              <li>The signed result fields required for Flare verification.</li>
            </ul>
            <p>
              Customer details, the full sales ledger, and the underlying private merchant record
              remain outside the public chain. Read the full boundary on the <Link className="legal__inline" href="/privacy">privacy page</Link>.
            </p>
          </section>

          <section>
            <h2>If the flow stops</h2>
            <ul>
              <li><b>No wallet found.</b> Install an injected EVM wallet such as MetaMask.</li>
              <li><b>Wrong network.</b> Approve the request to add or switch to Flare Coston2.</li>
              <li><b>Not enough gas.</b> Add C2FLR from a Coston2 faucet, then retry.</li>
              <li><b>FCE runtime unavailable.</b> The app blocks instruction dispatch when the public tee-proxy result endpoint is not configured.</li>
              <li><b>Record not found.</b> Check the exact reference agreed with the merchant.</li>
              <li><b>Expired result.</b> Run the FCE evaluation again to obtain a fresh signed result.</li>
            </ul>
          </section>

          <section>
            <h2>Reference evidence</h2>
            <p>
              Inspect the <Link className="legal__inline" href="/app/receipt">reference receipt</Link>, the <Link className="legal__inline" href="/app/activity">failure matrix</Link>, the <Link className="legal__inline" href="/app/inspector">verification checks</Link>, or the public Coston2 settlement linked from the landing page.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
