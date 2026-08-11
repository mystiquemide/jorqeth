"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// One first-load entrance, no scroll-triggered hiding.
//
// The server renders children fully visible, so no-JS and reduced-motion users
// always see everything. After mount, ONLY elements already in the first
// viewport play a short fade-up; anything below the fold is left fully visible
// and never hidden. That means a full-page automated screenshot (which does not
// scroll) captures every section instead of blank bands where an
// IntersectionObserver never fired.
export default function Reveal({
  children,
  as: Tag = "div",
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [entering, setEntering] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Only the initial-viewport band animates. A little slack below the fold so
    // an element peeking in at load still gets the entrance.
    const inFirstView = el.getBoundingClientRect().top < window.innerHeight * 0.9;
    if (!inFirstView) return;

    setEntering(true); // adds .pre (hidden) for this paint
    const r1 = requestAnimationFrame(() =>
      requestAnimationFrame(() => setShown(true)) // next paint adds .in (revealed)
    );
    return () => cancelAnimationFrame(r1);
  }, []);

  const cls = ["reveal", entering ? "pre" : "", shown ? "in" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    // @ts-expect-error dynamic tag with ref
    <Tag ref={ref} className={cls} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  );
}
