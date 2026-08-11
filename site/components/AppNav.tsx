"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    section: "Overview",
    links: [
      {
        href: "/app",
        label: "Settle commission",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.7" /><rect x="13" y="3" width="8" height="5" rx="1.6" stroke="currentColor" strokeWidth="1.7" /><rect x="13" y="10" width="8" height="11" rx="1.6" stroke="currentColor" strokeWidth="1.7" /><rect x="3" y="13" width="8" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.7" /></svg>
        ),
      },
    ],
  },
  {
    section: "Proof",
    links: [
      {
        href: "/app/receipt",
        label: "Payout receipt",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M9 8h6M9 12h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
        ),
      },
      {
        href: "/app/inspector",
        label: "Verification details",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" /><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
        ),
      },
      {
        href: "/app/activity",
        label: "Settlement matrix",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
        ),
      },
    ],
  },
  {
    section: "Learn",
    links: [
      {
        href: "/docs",
        label: "How Jorqeth works",
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" stroke="currentColor" strokeWidth="1.7" /><path d="M8 20a3 3 0 0 1 0-6h11M9 8h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
        ),
      },
    ],
  },
];

export default function AppNav() {
  const path = usePathname();

  return (
    <aside className="appnav">
      <Link className="appnav__brand" href="/">
        <Image src="/assets/mark.svg" alt="" width={30} height={30} />
        Jorqeth
      </Link>

      {NAV.map((group) => (
        <div key={group.section}>
          <div className="appnav__section">{group.section}</div>
          {group.links.map((l) => {
            const active = path === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`appnav__link${active ? " appnav__link--active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {l.icon}
                {l.label}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="appnav__foot">
        <span className="dot" />
        Coston2 · chain 114
      </div>
    </aside>
  );
}
