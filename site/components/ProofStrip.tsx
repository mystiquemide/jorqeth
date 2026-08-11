"use client";

import { useState, type ReactNode } from "react";

// Auto-scrolling proof strip with a real, keyboard-reachable pause control.
// The track still pauses on hover, but the button is the accessible path: it is
// a focusable <button> with aria-pressed, so keyboard and screen-reader users
// can stop the motion. Under prefers-reduced-motion the track is static and the
// button simply reads the state.
export default function ProofStrip({ items }: { items: ReactNode[] }) {
  const [paused, setPaused] = useState(false);

  return (
    <div className={`proofstrip${paused ? " is-paused" : ""}`} aria-label="Proven facts">
      <div className="marquee">
        <div className="marquee__group">
          {items.map((m, i) => (
            <span className="marquee__item" key={`a${i}`}>{m}</span>
          ))}
        </div>
        <div className="marquee__group" aria-hidden="true">
          {items.map((m, i) => (
            <span className="marquee__item" key={`b${i}`}>{m}</span>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="proofstrip__toggle"
        aria-pressed={paused}
        onClick={() => setPaused((p) => !p)}
      >
        {paused ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
            Play
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
            Pause
          </>
        )}
      </button>
    </div>
  );
}
