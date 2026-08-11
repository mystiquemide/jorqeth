import type { Metadata } from "next";
import AppNav from "@/components/AppNav";

export const metadata: Metadata = {
  title: {
    default: "Settlement app",
    template: "%s · Jorqeth",
  },
  description:
    "Create, fund, evaluate, and settle an exact private commission on Flare Testnet Coston2.",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="appshell">
      <AppNav />
      <div className="appmain">
        <header className="apptop">
          <div>
            <div className="apptop__title">Private commission settlement</div>
            <div className="apptop__sub">Flare Testnet Coston2 · chain 114</div>
          </div>
          <div className="apptop__right">
            <span className="wallet">
              <span className="dot" style={{ background: "var(--tone-retry)" }} />
              Testnet only
            </span>
          </div>
        </header>
        <div className="appbody">{children}</div>
      </div>
    </div>
  );
}
