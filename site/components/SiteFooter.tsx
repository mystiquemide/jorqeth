import Image from "next/image";
import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__grid">
          <div className="footer__brand">
            <Link className="brand" href="/">
              <Image src="/assets/mark.svg" alt="" width={32} height={32} />
              Jorqeth
            </Link>
            <p>
              Private proofs. Exact commissions. Settles what the agreed merchant record shows,
              on-chain.
            </p>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><Link href="/#how">How it works</Link></li>
              <li><Link href="/app">Open the app</Link></li>
              <li><Link href="/app/receipt">Live payout</Link></li>
              <li><Link href="/app/inspector">Proof inspector</Link></li>
            </ul>
          </div>
          <div>
            <h4>Proof</h4>
            <ul>
              <li><Link href="/app/activity">Settlement matrix</Link></li>
              <li><Link href="/#outcomes">The numbers</Link></li>
              <li><Link href="/#security">Security</Link></li>
              <li><Link href="/#faq">FAQ</Link></li>
            </ul>
          </div>
          <div>
            <h4>Resources</h4>
            <ul>
              <li><a href="https://github.com/mystiquemide/jorqeth" rel="noopener">GitHub</a></li>
              <li><a href="https://github.com/mystiquemide/jorqeth#readme" rel="noopener">README</a></li>
              <li><a href="https://flare.network" rel="noopener">Flare</a></li>
            </ul>
          </div>
        </div>
        <div className="footer__bottom">
          <span>© 2026 Jorqeth. MIT licensed.</span>
          <span className="tag">
            <span className="dot" style={{ background: "var(--tone-retry)" }}></span> Testnet and
            synthetic data only
          </span>
          <span>Photography via Unsplash</span>
        </div>
      </div>
    </footer>
  );
}
