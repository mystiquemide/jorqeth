import type { Metadata } from "next";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import SkipLink from "@/components/SkipLink";
import { liveProof } from "@/lib/live-proof";

export const metadata: Metadata = {
  title: "Live Flare settlement proof",
  description:
    "Inspect Jorqeth's live Flare Confidential Compute instruction, verified 20 mUSD commission settlement, remaining escrow, and replay rejection on Coston2.",
};

function short(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export default function ProofPage() {
  return (
    <>
      <SkipLink />
      <SiteNav />
      <main id="main" className="legal" tabIndex={-1}>
        <div className="container legal__wrap">
          <Link className="legal__crumb" href="/">
            <span className="arrow">→</span> Back to Jorqeth
          </Link>

          <span className="eyebrow">Live on Flare Coston2</span>
          <h1>A private commission was verified and paid exactly once.</h1>
          <p className="legal__lede">
            Jorqeth sent a real Flare Confidential Compute instruction from the hosted app,
            received a signed result from the active testnet TEE, verified it on-chain, paid
            exactly 20 mUSD, left 80 mUSD in escrow, and rejected a replay of the same order.
          </p>

          <section>
            <h2>The result</h2>
            <ul>
              <li><b>Campaign:</b> {short(liveProof.campaign)}</li>
              <li><b>Commission:</b> {liveProof.paidAmount} mUSD</li>
              <li><b>Remaining escrow:</b> {liveProof.remainingEscrow} mUSD</li>
              <li><b>Active TEE signer:</b> {short(liveProof.teeSigner)}</li>
              <li><b>Replay attempt:</b> rejected</li>
            </ul>
            <p>
              The private demo reference and underlying merchant record are not returned in the
              public settlement result. The chain receives only the domain-bound data required to
              verify and settle the payout.
            </p>
          </section>

          <section>
            <h2>1. Flare Confidential Compute instruction</h2>
            <p>
              Instruction ID: <code>{liveProof.instructionId}</code>
            </p>
            <a className="btn btn--primary docs-cta" href={liveProof.instructionUrl} target="_blank" rel="noreferrer">
              Open FCE instruction on Coston2
            </a>
          </section>

          <section>
            <h2>2. Exact on-chain settlement</h2>
            <p>
              The signed result decoded to a 20 mUSD commission. The settlement contract accepted
              the verifier proof, moved exactly that amount to the creator, and retained 80 mUSD in
              the campaign escrow.
            </p>
            <a className="btn btn--primary docs-cta" href={liveProof.settlementUrl} target="_blank" rel="noreferrer">
              Open settlement on Coston2
            </a>
          </section>

          <section>
            <h2>3. Paid once</h2>
            <p>
              After settlement, the order digest is closed by the replay guard. A second attempt
              using the same order was rejected, so the same private record cannot release the
              commission twice.
            </p>
          </section>

          <section>
            <h2>What this proves</h2>
            <p>
              The hosted Jorqeth flow is not a static dashboard or a mocked payout. The live path
              connects wallet actions, Coston2 escrow, Flare Confidential Compute, signed-result
              verification, and settlement into one reproducible testnet flow.
            </p>
            <p>
              This run uses Flare&apos;s supported simulated-TEE mode on Coston2. It proves the FCE
              lifecycle and active-TEE verification path, but it is not a claim of hardware-backed
              production attestation.
            </p>
          </section>

          <section>
            <h2>Try the flow</h2>
            <p>
              The public app is connected to the live FCE result bridge. Use the testnet flow to
              create a campaign, fund escrow, run the private check, and settle an exact commission.
            </p>
            <Link className="btn btn--primary docs-cta" href="/app">Open Jorqeth</Link>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
