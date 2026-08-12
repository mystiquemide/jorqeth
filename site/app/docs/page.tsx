import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import SkipLink from "@/components/SkipLink";

export const metadata: Metadata = {
  title: "How Jorqeth works",
  description:
    "How to create, fund, evaluate, settle, and verify a private commission on Flare Testnet Coston2.",
};

const STEPS = [
  ["Connect a wallet", "Use an injected EVM wallet and switch to Coston2, chain 114."],
  ["Choose the recipient", "Set the creator or affiliate wallet that the campaign can pay."],
  ["Fix the rule", "Create a campaign with a commission percentage and seven-day end time."],
  ["Fund escrow", "Mint test mUSD, approve the campaign, and lock the payout budget."],
  ["Enter a reference", "Use the record reference agreed with the merchant. Do not enter customer data."],
  ["Evaluate privately", "The evaluator applies the fixed rule and returns only a signed outcome."],
  ["Settle", "The campaign contract checks the signed result and releases the exact amount."],
  ["Verify paid once", "The order fingerprint closes after settlement, so the same order cannot pay twice."],
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

          <h1>How Jorqeth works</h1>
          <p className="legal__lede">
            Jorqeth binds a commission rule, payout wallet, private evaluation, and escrow to one
            campaign. The result is an exact testnet payout that can settle once.
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
            <Link className="btn btn--primary docs-cta" href="/app">Open the settlement app</Link>
          </section>

          <section>
            <h2>What is live on Coston2</h2>
            <p>
              When the public deployment addresses are configured, wallet connection, campaign
              creation, test-token minting, escrow funding, settlement, balances, and the paid-once
              guard all use Flare Testnet Coston2. Every transaction can be checked in the public
              Coston2 explorer.
            </p>
          </section>

          <section>
            <h2>Current trust boundary</h2>
            <p>
              The private check is sent through the deployed FCE instruction sender. An active
              Coston2 TEE reads the record inside the extension, returns a signed ActionResult,
              and the browser verifies that result against the current MachineManager set. The
              browser never receives the underlying record.
            </p>
            <p>
              The settlement contract still checks the campaign, recipient, amount, rule, chain,
              expiry, signer, and replay guard before any test tokens move.
            </p>
          </section>

          <section>
            <h2>What becomes public</h2>
            <ul>
              <li>The campaign contract and wallet addresses.</li>
              <li>The exact commission amount and transaction history.</li>
              <li>An opaque order fingerprint used to stop repeat payouts.</li>
            </ul>
            <p>
              Customer details, the full sales ledger, and the eligible net sale amount should
              stay outside the browser and chain. Read the full boundary on the <Link className="legal__inline" href="/privacy">privacy page</Link>.
            </p>
          </section>

          <section>
            <h2>If the flow stops</h2>
            <ul>
              <li><b>No wallet found.</b> Install an injected EVM wallet such as MetaMask.</li>
              <li><b>Wrong network.</b> Approve the request to add or switch to Coston2.</li>
              <li><b>Not enough gas.</b> Add C2FLR from a Coston2 faucet, then retry.</li>
              <li><b>Record not found.</b> Check the exact reference agreed with the merchant.</li>
              <li><b>Expired result.</b> Run the evaluation again to get a fresh signed result.</li>
            </ul>
          </section>

          <section>
            <h2>Reference evidence</h2>
            <p>
              The committed proof suite remains available alongside the live interactive testnet
              flow. Inspect the <Link className="legal__inline" href="/app/receipt">reference receipt</Link>, the <Link className="legal__inline" href="/app/activity">failure matrix</Link>, or the <Link className="legal__inline" href="/app/inspector">verification checks</Link>.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
