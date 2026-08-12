import Image from "next/image";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import Reveal from "@/components/Reveal";
import ProofStrip from "@/components/ProofStrip";
import Faq from "@/components/Faq";
import ScrollToSection from "@/components/ScrollToSection";
import SkipLink from "@/components/SkipLink";
import { usd, ledgerSummary, gateSummary } from "@/lib/evidence";

// Figures are read at build time from the committed proof artifacts.
const s = ledgerSummary();
const gate = gateSummary();
const PAID = usd(20000000);
const LIVE_SETTLEMENT_URL =
  "https://coston2-explorer.flare.network/tx/0x6165197afcfb0c4b66bb9f4d7e8e732bafa403d11f034af504556f69dae5700a";

const MARQUEE = [
  <><b>Built on Flare</b></>,
  <>Powered by <b>Flare Confidential Compute</b></>,
  <><b>Exact to the cent</b></>,
  <><b>{s.paid} of {s.total}</b> paths paid</>,
  <><b>{gate.checklistPassed} / {gate.checklistTotal}</b> proof-gate checks</>,
  <><b>Private</b> by default</>,
  <><b>{gate.forgePassed}</b> tests green</>,
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
              <span className="eyebrow">Built on Flare</span>
              <h1 className="hero__title">Private commissions. Verified on Flare.</h1>
              <p className="hero__sub">
                Jorqeth uses Flare Confidential Compute to evaluate an agreed private merchant
                record, calculate the exact creator commission, and settle it on Flare Coston2
                without exposing the underlying ledger.
              </p>
              <div className="hero__actions">
                <a className="btn btn--primary" href={LIVE_SETTLEMENT_URL} target="_blank" rel="noreferrer">
                  See the Flare settlement proof <span className="arrow">→</span>
                </a>
                <Link className="btn btn--tinted" href="/app">Open the Flare app</Link>
              </div>
              <div className="hero__trust">
                <span><b>Flare Confidential Compute.</b> Private evaluation through a registered TEE.</span>
                <span><b>Exact settlement.</b> Domain-bound and replay-protected on Coston2.</span>
                <span><b>Verifiable.</b> Signed Flare ActionResult checked before value moves.</span>
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
              <h2>Fund on Flare. Evaluate privately. Settle exactly.</h2>
              <p>
                Jorqeth routes the commission request through Flare FCE, receives a signed TEE
                ActionResult, verifies the signer against the active TEE set, and settles the exact
                payout on Coston2.
              </p>
            </Reveal>
            <div className="steps">
              <Reveal className="step">
                <div className="step__flow"><div className="step__n">STEP 01</div><div className="step__icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M3 10h18M8 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></div></div>
                <h3>Fund escrow on Flare</h3>
                <p>The merchant creates a campaign on Coston2, fixes the commission rule, and locks the payout budget before evaluation.</p>
              </Reveal>
              <Reveal className="step">
                <div className="step__flow"><div className="step__n">STEP 02</div><div className="step__icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></div></div>
                <h3>Evaluate with Flare Confidential Compute</h3>
                <p>An active TEE processes the private merchant record inside the Jorqeth extension and returns only the minimal signed payout result.</p>
              </Reveal>
              <Reveal className="step">
                <div className="step__flow"><div className="step__n">STEP 03</div><div className="step__icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></div></div>
                <h3>Verify and settle on Flare</h3>
                <p>FccResultVerifier authenticates the Flare ActionResult against the active TEE set before the exact commission can move. Replay, tamper, wrong-domain, expiry, and unknown paths cannot pay.</p>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="section" id="outcomes">
          <div className="container">
            <Reveal className="head">
              <span className="eyebrow">Flare Coston2 proof</span>
              <h2>From FCE instruction to exact on-chain payout.</h2>
              <p>
                The committed proof traces one Jorqeth commission through Flare FCE instruction
                dispatch, active TEE evaluation, signed ActionResult verification, and final Coston2 settlement.
              </p>
            </Reveal>
            <div className="stats">
              <Reveal className="stat"><div className="stat__value">+{PAID}<span className="unit">mUSD</span></div><div className="stat__label">Exact testnet commission released to the creator once on Flare Coston2.</div></Reveal>
              <Reveal className="stat"><div className="stat__value">{s.paid}<span className="unit">of {s.total} paths</span></div><div className="stat__label">Every tested refund, replay, tamper, wrong-domain, expiry, and unknown path moved no value.</div></Reveal>
              <Reveal className="stat"><div className="stat__value">{gate.checklistPassed} / {gate.checklistTotal}<span className="unit">checks</span></div><div className="stat__label">The proof gate checks the committed evidence and amount sources for agreement.</div></Reveal>
            </div>
            <Reveal className="outcomes__note">
              <p>The FCE instruction, raw signed ActionResult, Coston2 settlement event, creator payout, and remaining escrow agree on the same amount.</p>
              <a className="btn btn--primary" href={LIVE_SETTLEMENT_URL} target="_blank" rel="noreferrer">Open the Flare settlement <span className="arrow">→</span></a>
            </Reveal>
          </div>
        </section>

        <section className="section section--ink">
          <div className="container">
            <Reveal as="figure" className="quote">
              <div className="quote__mark" aria-hidden="true">&ldquo;</div>
              <blockquote>The private record stays off-chain. The signed result is verified on Flare before the payout can move.</blockquote>
              <figcaption>Jorqeth&apos;s primary settlement path on Flare Coston2.</figcaption>
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
                  <span className="tick">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <span>
                    <b>No private ledger on-chain.</b> Customer records and revenue fields remain
                    inside the evaluation boundary. The chain sees only the minimum domain-bound result.
                  </span>
                </li>
                <li>
                  <span className="tick">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <span>
                    <b>Verified by the Flare trust path.</b> Jorqeth reconstructs the raw Flare
                    ActionResult signing hash and checks the recovered signer against the active TEE set before escrow moves.
                  </span>
                </li>
                <li>
                  <span className="tick">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <span>
                    <b>Exact once, or zero.</b> The settlement contract binds campaign, creator,
                    amount, chain, rule, expiry, and replay state before releasing any test tokens.
                  </span>
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
              <span className="eyebrow">Flare Confidential Compute</span>
              <h2>Private record in. Exact payout on Flare.</h2>
              <p>Run the Flare-native flow or inspect the committed Coston2 settlement before taking our word for anything.</p>
              <div className="hero__actions">
                <Link className="btn btn--primary" href="/app">Run with Flare FCE <span className="arrow">→</span></Link>
                <a className="btn btn--tinted" href={LIVE_SETTLEMENT_URL} target="_blank" rel="noreferrer">See the Coston2 proof</a>
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
