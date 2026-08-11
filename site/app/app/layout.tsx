import type { Metadata } from "next";
import AppNav from "@/components/AppNav";
import { shortHash, deployment } from "@/lib/evidence";

export const metadata: Metadata = {
  title: {
    default: "Live proof",
    template: "%s · Jorqeth",
  },
  description:
    "The live Jorqeth settlement proof, read straight from the committed on-chain evidence. One eligible sale paid exact, everything else zero.",
};

// The signed-in shell. Wallet address shown is the real proof creator account,
// read from the committed deployment, not a placeholder.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const d = deployment();
  return (
    <div className="appshell">
      <AppNav />
      <div className="appmain">
        <header className="apptop">
          <div>
            <div className="apptop__title">Live settlement proof</div>
            <div className="apptop__sub">
              Flare FCC · {d.verifierMode}
            </div>
          </div>
          <div className="apptop__right">
            <span className="wallet" title={`Connected creator account ${d.creator}`}>
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
