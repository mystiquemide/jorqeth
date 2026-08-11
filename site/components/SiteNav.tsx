"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/how", label: "How it works" },
  { href: "/proof", label: "Proof" },
  { href: "/security", label: "Security" },
  { href: "/faq", label: "FAQ" },
];

export default function SiteNav({ overlay = false }: { overlay?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`nav${overlay ? " nav--overlay" : ""}${scrolled ? " nav--scrolled" : ""}`}>
      <div className="container nav__inner">
        <Link className="brand" href="/" aria-label="Jorqeth home">
          <Image src="/assets/mark.svg" alt="" width={32} height={32} priority />
          Jorqeth
        </Link>

        <nav className={`nav__menu${open ? " open" : ""}`} aria-label="Primary">
          <div className="nav__links">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
          </div>
          <Link className="btn btn--primary" href="/app" onClick={() => setOpen(false)}>
            Open the app <span className="arrow">→</span>
          </Link>
        </nav>

        <div className="nav__cta">
          <Link className="btn btn--primary nav__desktop-cta" href="/app">
            Open the app
          </Link>
          <button
            className="nav__toggle"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
