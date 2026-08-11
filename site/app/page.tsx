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
  <><b>Exact to the cent</b></>,
  <><b>{s.paid} of {s.total}</b> paths paid</>,
  <><b>{gate.checklistPassed} / {gate.checklistTotal}</b> proof-gate checks</>,
  <>Built on <b>Flare</b></>,
  <><b>Private</b> by default</>,
  <><b>{gate.forgePassed}</b> tests green</>,
  <>Five sources <b>agree</b></>,
];

export type LandingSection = "how" | "outcomes" | "security" | "faq";

export function LandingPage({ scrollTo }: { scrollTo?: LandingSection }) {
  return (
    <>
      <ScrollToSection target={scrollTo} />
      <SkipLink />
      <SiteNav overlay />

      <main id="main" tabIndex={-1}>
        {/* HERO */}
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
              <h1 className="hero__title">Get paid exactly what you earned.</h1>
              <p className="hero__sub">
                Jorqeth takes an agreed private record, works out the commission you&apos;re owed
                to the cent, and settles it on-chain. No exposed ledgers, no trust-me math.
              </p>
              <div className="hero__actions">
                <a className="btn btn--primary" href={LIVE_SETTLEMENT_URL} target="_blank" rel="noreferrer">
                  See the settlement proof <span className="arrow">→</span>
                </a>
                <Link className="btn btn--tinted" href="/how">How it works</Link>
              </div>
              <div className="hero__trust">
                <span><b>Exact to the cent.</b> Five evidence sources agree.</span>
                <span><b>{s.paid} of {s.total}</b> tested paths moved value.</span>
                <span>Built on <b>Flare</b>.</span>
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
              <h2>You can&apos;t see the ledger. They can&apos;t show it to you.</h2>
              <p>
                A creator owed a commission can&apos;t inspect a merchant&apos;s private orders. The
                merchant can&apos;t publish customer and revenue data just to prove a payout is fair.
                So commissions often fall back to trust and screenshots.
              </p>
              <p>
                Jorqeth settles what an agreed record shows. Both sides fix the record source and
                the rule up front, then the settlement contract enforces the resulting payout.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="section section--band" id="how">
          <div className="container">
            <Reveal className="head">
              <span className="eyebrow">How it works</span>
              <h2>Funded up front. Evaluated privately. Paid exactly.</h2>
              <p>A funded Coston2 campaign now has a complete FCE proof: instruction dispatch, active TEE evaluation, signed ActionResult, and exact on-chain payout.</p>
            </Reveal>
            <div className="steps">
              <Reveal className="step">
                <div className="step__flow"><div className="step__n">STEP 01</div><div className="step__icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M3 10h18M8 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></div></div>
                <h3>Merchant funds escrow</h3>
                <p>The merchant deposits the payout budget and fixes the commission rule before settlement.</p>
              </Reveal>
              <Reveal className="step">
                <div className="step__flow"><div className="step__n">STEP 02</div><div className="step__icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></div></div>
                <h3>Evaluated in private</h3>
                <p>An active Coston2 TEE reads the private record inside the extension and returns only the minimal signed payout result.</p>
              </Reveal>
              <Reveal className="step">
                <div className="step__flow"><div className="step__n">STEP 03</div><div className="step__icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></div></div>
                <h3>Paid exactly, once</h3>
                <p>The contract releases the exact commission to the bound creator once. Refund, replay, tamper, wrong-domain, and unknown paths cannot pay.</p>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="section" id="outcomes">
          <div className="container">
            <Reveal className="head">
              <span className="eyebrow">Committed proof</span>
              <h2>One eligible sale. One exact payout. Everything else zero.</h2>
              <p>These figures come from Jorqeth&apos;s committed on-chain proof artifacts.</p>
            </Reveal>
            <div className="stats">
              <Reveal className="stat"><div className="stat__value">+{PAID}<span className="unit">mUSD</span></div><div className="stat__label">Exact testnet commission released to the creator once.</div></Reveal>
              <Reveal className="stat"><div className="stat__value">{s.paid}<span className="unit">of {s.total} paths</span></div><div className="stat__label">Every tested refund, replay, tamper, wrong-domain, expiry, and unknown path moved no value.</div></Reveal>
              <Reveal className="stat"><div className="stat__value">{gate.checklistPassed} / {gate.checklistTotal}<span className="unit">checks</span></div><div className="stat__label">The committed proof gate checks the evidence and five amount sources for agreement.</div></Reveal>
            </div>
            <Reveal className="outcomes__note">
              <p>The FCE instruction, raw signed ActionResult, Coston2 settlement event, creator payout, and remaining escrow agree on the same amount.</p>
              <a className="btn btn--primary" href={LIVE_SETTLEMENT_URL} target="_blank" rel="noreferrer">Open the Coston2 settlement <span className="arrow">→</span></a>
            </Reveal>
          </div>
        </section>

        <section className="section section--ink">
          <div className="container">
            <Reveal as="figure" className="quote">
              <div className="quote__mark" aria-hidden="true">&ldquo;</div>
              <blockquote>Five evidence sources agree on the payout, and only one tested path out of twelve moved value.</blockquote>
              <figcaption>Read from the committed positive and negative proof artifacts.</figcaption>
            </Reveal>
          </div>
        </section>

        <section className="section section--proof section--split-bleed" id="security">
          <div className="secure secure--bleed">
            <Reveal className="secure__media"><Image src="/assets/security.jpg" alt="A calm, quiet workspace" width={1200} height={801} /></Reveal>
            <Reveal className="secure__body">
              <h2>Their customers stay private. Your payout stays provable.</h2>
              <ul className="checklist">
                <li>
                  <span className="tick">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <span>
                    <b>No private data on-chain.</b> No customer record, revenue field, or private key
                    ever appears in any result or event. Order references are opaque digests.
                  </span>
                </li>
                <li>
                  <span className="tick">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <span>
                    <b>Signed, not screenshotted.</b> The live Coston2 proof verifies the raw Flare
                    ActionResult signature against the active TEE set before any escrow can move.
                  </span>
                </li>
                <li>
                  <span className="tick">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <span>
                    <b>Not-sure is not not-owed.</b> If the system can&apos;t decide, it pays zero and
                    stays retryable, never a wrong payout. Escrow stays intact.
                  </span>
                </li>
              </ul>
            </Reveal>
          </div>
        </section>

        <section className="section" id="faq">
          <div className="container"><Reveal className="head head--center"><h2>Straight answers</h2></Reveal><Faq /></div>
        </section>

        <section className="section section--jade">
          <div className="container">
            <Reveal className="finalcta">
              <h2>Earned it. Prove it. Get paid it.</h2>
              <p>See the committed settlement, exact to the cent, before you take our word for anything.</p>
              <div className="hero__actions">
                <a className="btn btn--primary" href={LIVE_SETTLEMENT_URL} target="_blank" rel="noreferrer">See the Coston2 settlement <span className="arrow">→</span></a>
                <Link className="btn btn--tinted" href="/app">Open the app</Link>
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
