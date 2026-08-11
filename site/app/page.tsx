import Image from "next/image";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import Reveal from "@/components/Reveal";
import ProofStrip from "@/components/ProofStrip";
import Faq from "@/components/Faq";
import { usd, ledgerSummary, gateSummary } from "@/lib/evidence";

// Real figures, read at build time from the committed proof. Nothing is invented.
const s = ledgerSummary();
const gate = gateSummary();
const PAID = usd(20000000); // exact commission released, 6dp

const MARQUEE = [
  <>
    <b>Exact to the cent</b>
  </>,
  <>
    <b>{s.paid} of {s.total}</b> paths paid
  </>,
  <>
    <b>{gate.checklistPassed} / {gate.checklistTotal}</b> proof-gate checks
  </>,
  <>Built on <b>Flare</b></>,
  <>
    <b>Private</b> by default
  </>,
  <>
    <b>{gate.forgePassed}</b> tests green
  </>,
  <>Five sources <b>agree</b></>,
];

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <SiteNav />

      <main id="main">
        {/* HERO */}
        <section className="hero">
          <div className="container hero__grid">
            <Reveal className="hero__copy">
              <h1 className="hero__title">Get paid exactly what you earned.</h1>
              <p className="hero__sub">
                Jorqeth takes an agreed private record, works out the commission you&apos;re owed
                to the cent, and settles it on-chain. No exposed ledgers, no trust-me math.
              </p>
              <div className="hero__actions">
                <Link className="btn btn--primary" href="/app/receipt">
                  See the settlement proof <span className="arrow">→</span>
                </Link>
                <a className="btn btn--tinted" href="#how">How it works</a>
              </div>
              <p className="hero__note" style={{ marginTop: 12, fontSize: "var(--fs-sm)", color: "var(--text-muted)" }}>
                Local replay, simulated attestation, synthetic records. A live production
                attestation round trip is the one remaining piece.
              </p>
              <div className="hero__trust">
                <span><b>Exact to the cent.</b> Five sources agree.</span>
                <span><b>{s.paid} of {s.total}</b> paths moved value.</span>
                <span>Built on <b>Flare</b>.</span>
              </div>
            </Reveal>

            <Reveal className="hero__media">
              <Image
                src="/assets/hero.jpg"
                alt="Two creators celebrating a payout at a laptop"
                width={1400}
                height={933}
                priority
              />
              <div className="receipt-chip">
                <div className="receipt-chip__icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div className="receipt-chip__amt mono">+{PAID} mUSD</div>
                  <div className="receipt-chip__label">
                    <span className="dot dot--pulse" style={{ verticalAlign: "middle", marginRight: 5 }} />
                    settled in block 9
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* PROOF STRIP */}
        <ProofStrip items={MARQUEE} />

        {/* PROBLEM */}
        <section className="section" id="problem">
          <div className="container split">
            <Reveal className="split__media">
              <Image src="/assets/problem.jpg" alt="A payment happening at a counter" width={1200} height={801} />
            </Reveal>
            <Reveal className="split__body">
              <h2>You can&apos;t see the ledger. They can&apos;t show it to you.</h2>
              <p>
                A creator owed a commission can&apos;t inspect a merchant&apos;s private orders. The
                merchant can&apos;t publish customer and revenue data just to prove your payout is
                fair. So commissions run on trust and screenshots.
              </p>
              <p>
                Jorqeth settles what the agreed record shows. Both sides fix the record source and
                the rule up front, then the math runs privately and pays out exactly.
              </p>
            </Reveal>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="section section--band" id="how">
          <div className="container">
            <Reveal className="head">
              <span className="eyebrow">How it works</span>
              <h2>Funded up front. Evaluated privately. Paid exactly.</h2>
              <p>Three steps, one honest outcome. Customer data never leaves the merchant&apos;s side.</p>
            </Reveal>
            <div className="steps">
              <Reveal className="step">
                <div className="step__flow">
                  <div className="step__n">STEP 01</div>
                  <div className="step__icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M3 10h18M8 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
                <h3>Merchant funds escrow</h3>
                <p>
                  The merchant deposits the payout budget and fixes the commission rule, the
                  fixed-rate floor formula, before any sale is evaluated.
                </p>
              </Reveal>
              <Reveal className="step">
                <div className="step__flow">
                  <div className="step__n">STEP 02</div>
                  <div className="step__icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
                <h3>Evaluated in private</h3>
                <p>
                  A confidential compute step on Flare checks each sale against the agreed record and
                  returns only a signed result and the exact amount. Nothing about the customer is
                  exposed.
                </p>
              </Reveal>
              <Reveal className="step">
                <div className="step__flow">
                  <div className="step__n">STEP 03</div>
                  <div className="step__icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
                <h3>Paid exactly, once</h3>
                <p>
                  The contract releases the exact commission to the bound creator, one time. Every
                  refund, replay, or tampered case pays zero.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* OUTCOMES (real numbers) */}
        <section className="section" id="outcomes">
          <div className="container">
            <Reveal className="head">
              <span className="eyebrow">Proven</span>
              <h2>One eligible sale. One exact payout. Everything else zero.</h2>
              <p>These are the real figures from Jorqeth&apos;s committed on-chain proof, not a demo mock-up.</p>
            </Reveal>
            <div className="stats">
              <Reveal className="stat">
                <div className="stat__value">+{PAID}<span className="unit">mUSD</span></div>
                <div className="stat__label">Exact commission released to the creator, once, in block 9.</div>
              </Reveal>
              <Reveal className="stat">
                <div className="stat__value">{s.paid}<span className="unit">of {s.total} paths</span></div>
                <div className="stat__label">
                  Every other path, refund, replay, tampering, wrong chain, expiry, unknown, paid
                  nothing.
                </div>
              </Reveal>
              <Reveal className="stat">
                <div className="stat__value">{gate.checklistPassed} / {gate.checklistTotal}<span className="unit">checks</span></div>
                <div className="stat__label">
                  The full verification suite passes in one command, with five independent amount sources in
                  agreement.
                </div>
              </Reveal>
            </div>
            <Reveal className="outcomes__note">
              <p>
                Configured formula, signed result, on-chain event, creator balance delta, and escrow
                delta all equal the same number to the cent. That is what exact means here.
              </p>
              <Link className="btn btn--primary" href="/app/receipt">
                Open the settlement proof <span className="arrow">→</span>
              </Link>
            </Reveal>
          </div>
        </section>

        {/* PROOF QUOTE */}
        <section className="section section--ink">
          <div className="container">
            <Reveal as="figure" className="quote">
              <div className="quote__mark" aria-hidden="true">&ldquo;</div>
              <blockquote>
                Five independent sources agreed on the payout to the cent, and only the one eligible
                path out of twelve moved value.
              </blockquote>
              <figcaption>
                Read straight from Jorqeth&apos;s committed positive and negative proofs. No customer,
                no testimonial, just the evidence.
              </figcaption>
            </Reveal>
          </div>
        </section>

        {/* SECURITY */}
        <section className="section section--proof" id="security">
          <div className="container secure">
            <Reveal className="secure__media">
              <Image src="/assets/security.jpg" alt="A calm, quiet workspace" width={1200} height={801} />
            </Reveal>
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
                    <b>Signed, not screenshotted.</b> Authenticity comes from a result signed by a
                    registered Flare compute node, checked against the on-chain registry. A tampered
                    amount or recipient fails at the boundary.
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

        {/* FAQ */}
        <section className="section" id="faq">
          <div className="container">
            <Reveal className="head head--center">
              <h2>Straight answers</h2>
            </Reveal>
            <Faq />
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="section section--jade">
          <div className="container">
            <Reveal className="finalcta">
              <h2>Earned it. Prove it. Get paid it.</h2>
              <p>See the committed settlement, exact to the cent, before you take our word for anything.</p>
              <div className="hero__actions">
                <Link className="btn btn--primary" href="/app/receipt">
                  See the settlement proof <span className="arrow">→</span>
                </Link>
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
