"use client";

export default function SkipLink() {
  const skipToMain = () => {
    const main = document.getElementById("main");
    if (!main) return;

    main.scrollIntoView({ block: "start" });
    main.focus({ preventScroll: true });
  };

  return (
    <button className="skip-link" type="button" onClick={skipToMain}>
      Skip to content
    </button>
  );
}
