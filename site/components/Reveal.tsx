"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Fades/rises children in on scroll. Server-renders fully visible; only after
// mount does it hide (.pre) then reveal (.in) on intersection, so no-JS and
// reduced-motion users always see content.
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
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setMounted(true);
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const cls = ["reveal", mounted ? "pre" : "", shown ? "in" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    // @ts-expect-error dynamic tag with ref
    <Tag ref={ref} className={cls} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  );
}
