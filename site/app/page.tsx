import Image from "next/image";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import Reveal from "@/components/Reveal";
import ProofStrip from "@/components/ProofStrip";
import Faq from "@/components/Faq";
import ScrollToSection from "@/components/ScrollToSection";
import SkipLink from "@/components/SkipLink";
import { ledgerSummary, gateSummary } from "@/lib/evidence";
import { liveProof } from "@/lib/live-proof";

// Figures are read at build time from the committed proof artifacts.
const s = ledgerSummary();
const gate = gateSummary();

const MARQUEE = [
  <><b>Built on Flare</b></>,
  <>Powered by <b>Flare Confidential Compute</b></>,
  <><b>FXRP</b> on Coston2</>,
  <><b>Exact settlement</b></>,
  <><b>{s.paid} of {s.total}</b> tested paths paid</>,
  <><b>{gate.checklistPassed} / {gate.checklistTotal}</b> proof-gate checks</>,
  <><b>Private</b> by default</>,
  <><b>Replay</b> rejected</>,
];

export type LandingSection = "how" | "outcomes" | "security" | "faq";

export function LandingPage({ scrollTo }: { scrollTo?: LandingSection }) {
  return (
    <>
      <ScrollToSection target={scrollTo} />
      <SkipLink />
      <SiteNav overlay />

      <main id="main" tabIndex={-1}>
        <section className="hero">
          <Image
            className="hero__image"
            src="/assets/hero.jpg"
            alt="Two people celebrating a successful payout"
            fill
            sizes="100vw"
            priority
          />
          <div className="hero__scrim" aria-hidden="true" />
          <div className="container hero__grid">
            <Reveal className="hero__copy">
              <h1 className="hero__title">Private XRP commissions. Verified on Flare.</h1>
              <p className="hero__sub">
                Fund with test FXRP. Flare Confidential Compute checks the agreed merchant record
                in private, then Jorqeth settles only the verified commission on Coston2.
              </p>
              <div className="hero__actionbar">
                <span className="hero__flare-label"><span className="dot" />Built on Flare</span>
                <div className="hero__actions">
                  <Link className="btn btn--primary" href="/app">
                    Open the FXRP app <span className="arrow">→</span>
                  </Link>
                  <Link className="btn btn--tinted" href="/proof">See the completed FCE proof</Link>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <ProofStrip items={MARQUEE} />

        <section className="section section--split-bleed" id="problem">
          <div className="split split--bleed">
            <Reveal className="split__media">
              <Image src="/assets/problem.jpg" alt="A payment happening at a counter" width={1200} height={801} />
            </Reveal>
            <Reveal className="split__body">
              <span className="eyebrow">Why Jorqeth</span>
              <h2>You can&apos;t see the ledger. They can&apos;t show it to you.</h2>
              <p>
                A creator owed a commission can&apos;t inspect a merchant&apos;s private orders. The
                merchant can&apos;t publish customer and revenue data just to prove a payout is fair.
                So commissions often fall back to trust and screenshots.
              </p>
              <p>
                Jorqeth fixes the record source and payout rule up front, uses Flare Confidential
                Compute to evaluate the private record, then lets the settlement contract enforce
                the signed result exactly once.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="section section--band" id="how">
          <div className="container">
            <Reveal className="head">
              <span className="eyebrow">Flare-native flow</span>
              <h2>Fund with FXRP. Evaluate privately. Settle exactly.</h2>
              <p>
                The merchant funds a test FXRP campaign on Coston2 and fixes the commission rule.
                Flare Confidential Compute privately evaluates the agreed record, then Jorqeth
                verifies the signed result before the exact FXRP payout can move.
              </p>
            </Reveal>
            <div className="steps">
              <Reveal className="step">
                <div className="step__flow"><div className="step__n">STEP 01</div><div className="step__icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M3 10h18M8 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></div></div>
                <h3>Fund FXRP escrow on Flare</h3>
                <p>The merchant creates a campaign on Coston2, fixes the payout wallet and commission rule, and locks test FXRP before evaluation.</p>
              </Reveal>
              <Reveal className="step">
                <div className="step__flow"><div className="step__n">STEP 02</div><div className="step__icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></div></div>
                <h3>Evaluate with Flare Confidential Compute</h3>
                <p>The agreed merchant record is checked inside the FCE runtime. Only the minimum signed payout result comes back for settlement.</p>
              </Reveal>
              <Reveal className="step">
                <div className="step__flow"><div className="step__n">STEP 03</div><div className="step__icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></div></div>
                <h3>Verify and settle FXRP on Flare</h3>
                <p>Jorqeth verifies the signed Flare result against the active TEE set before releasing the exact commission. Replay, tamper, wrong-domain, expiry, and unknown paths cannot pay.</p>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="section" id="outcomes">
          <div className="container">
            <Reveal className="head">
              <span className="eyebrow">Live Flare Coston2 FXRP proof</span>
              <h2>A private check produced one exact 3 FTestXRP payout.</h2>
              <p>
                The hosted app completed a genuine FCE instruction, signed-result verification,
                exact FXRP settlement, and replay rejection on Coston2.
              </p>
            </Reveal>
            <div className="stats">
              <Reveal className="stat"><div className="stat__value">+{liveProof.paidAmount}<span className="unit">FTestXRP</span></div><div className="stat__label">Exact testnet commission released to the creator in the live hosted FCE run.</div></Reveal>
              <Reveal className="stat"><div className="stat__value">{liveProof.remainingEscrow}<span className="unit">FTestXRP left</span></div><div className="stat__label">The campaign retained the remaining escrow after the verified payout.</div></Reveal>
              <Reveal className="stat"><div className="stat__value">1<span className="unit">payout</span></div><div className="stat__label">A replay attempt for the same order was rejected after settlement.</div></Reveal>
            </div>
            <Reveal className="outcomes__note">
              <p>
                The live run used a 100-unit private order at a 3% commission rate. The underlying
                merchant record was not returned to the browser or written on-chain.
              </p>
              <div className="hero__actions">
                <Link className="btn btn--primary" href="/proof">Inspect the completed proof <span className="arrow">→</span></Link>
                <a className="btn btn--tinted" href={liveProof.settlementUrl} target="_blank" rel="noreferrer">Open settlement on Coston2</a>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="section section--ink">
          <div className="container">
            <Reveal as="figure" className="quote">
              <div className="quote__mark" aria-hidden="true">&ldquo;</div>
              <blockquote>The private record stays private. The exact commission stays provable.</blockquote>
              <figcaption>Jorqeth&apos;s settlement path on Flare Coston2.</figcaption>
            </Reveal>
          </div>
        </section>

        <section className="section section--proof section--split-bleed" id="security">
          <div className="secure secure--bleed">
            <Reveal className="secure__media"><Image src="/assets/security.jpg" alt="A calm, quiet workspace" width={1200} height={801} /></Reveal>
            <Reveal className="secure__body">
              <span className="eyebrow">Flare-verified settlement</span>
              <h2>Their customers stay private. Your payout stays provable.</h2>
              <ul className="checklist">
                <li>
                  <span className="tick"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                  <span><b>No private ledger on-chain.</b> Customer records and revenue fields remain inside the evaluation boundary. The chain sees only the minimum domain-bound result.</span>
                </li>
                <li>
                  <span className="tick"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                  <span><b>Verified by the Flare trust path.</b> Jorqeth reconstructs the raw Flare ActionResult signing hash and checks the recovered signer against the active TEE set before escrow moves.</span>
                </li>
                <li>
                  <span className="tick"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                  <span><b>Exact once, or zero.</b> The settlement contract binds campaign, creator, amount, chain, rule, expiry, and replay state before releasing any test FXRP.</span>
                </li>
              </ul>
            </Reveal>
          </div>
        </section>

        <section className="section" id="faq">
          <div className="container"><Reveal className="head head--center"><span className="eyebrow">Built on Flare</span><h2>Straight answers</h2></Reveal><Faq /></div>
        </section>

        <section className="section section--jade">
          <div className="container">
            <Reveal className="finalcta">
              <span className="eyebrow">FXRP + Flare Confidential Compute</span>
              <h2>Private record in. Exact FXRP payout on Flare.</h2>
              <p>Run the current FXRP flow or inspect the completed FCE proof before taking our word for anything.</p>
              <div className="hero__actions">
                <Link className="btn btn--primary" href="/app">Open Jorqeth <span className="arrow">→</span></Link>
                <Link className="btn btn--tinted" href="/proof">See the completed proof</Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

export default function Home() {
  return <LandingPage />;
}
