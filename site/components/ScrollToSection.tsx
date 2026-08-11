"use client";

import { useEffect } from "react";

export default function ScrollToSection({ target }: { target?: string }) {
  useEffect(() => {
    if (!target) return;

    const scroll = () => {
      const section = document.getElementById(target);
      if (!section) return;

      const top = window.scrollY + section.getBoundingClientRect().top - 68;
      window.scrollTo({ top, behavior: "auto" });
    };

    scroll();
    const timeout = window.setTimeout(scroll, 150);
    window.addEventListener("load", scroll, { once: true });

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("load", scroll);
    };
  }, [target]);

  return null;
}
