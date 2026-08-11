import type { Metadata } from "next";
import AppNav from "@/components/AppNav";
import { shortHash, deployment } from "@/lib/evidence";

export const metadata: Metadata = {
  title: {
    default: "Settlement proof",
    template: "%s · Jorqeth",
  },
  description:
    "The committed Jorqeth settlement proof, read straight from the on-chain evidence of a local replay. One eligible sale paid exact, everything else zero.",
};

// The signed-in shell. The account shown is the proof's bound creator address, read
// from the committed local deployment. This is a replay view, not a connected wallet.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const d = deployment();
  return (
    <div className="appshell">
      <AppNav />
      <div className="appmain">
        <header className="apptop">
          <div>
            <div className="apptop__title">Settlement proof</div>
            <div className="apptop__sub">
              Flare FCC · {d.verifierMode}
            </div>
          </div>
          <div className="apptop__right">
            <span className="wallet" title={`Bound creator account ${d.creator}`}>
              <span className="dot" style={{ background: "var(--jade)" }} />
              Creator <span className="mono">{shortHash(d.creator, 6, 4)}</span>
            </span>
          </div>
        </header>
        <div className="appbody">{children}</div>
      </div>
    </div>
  );
}
