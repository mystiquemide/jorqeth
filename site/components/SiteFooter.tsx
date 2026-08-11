import Image from "next/image";
import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer__close">
          <Link className="brand" href="/">
            <Image src="/assets/mark.svg" alt="" width={32} height={32} />
            Jorqeth
          </Link>
          <p className="footer__proof">
            Five evidence sources agree on the committed local payout, and only one of twelve
            tested settlement paths moved value.
          </p>
          <div className="footer__links">
            <Link href="/app/receipt">Settlement receipt</Link>
            <Link href="/app/activity">Settlement matrix</Link>
            <a href="https://github.com/mystiquemide/jorqeth" target="_blank" rel="noopener noreferrer">Repository</a>
          </div>
        </div>
        <div className="footer__bottom">
          <span>© 2026 Jorqeth</span>
          <span className="tag">
            <span className="dot" style={{ background: "var(--tone-retry)" }}></span> Local devnet proof · synthetic data
          </span>
        </div>
      </div>
    </footer>
  );
}
