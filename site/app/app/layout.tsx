import type { Metadata } from "next";
import AppNav from "@/components/AppNav";
import AppWalletDisconnect from "@/components/AppWalletDisconnect";
import "../payment-console.css";
import "../mobile-app.css";

export const metadata: Metadata = {
  title: {
    default: "Commission payments",
    template: "%s · Jorqeth",
  },
  description:
    "Check a private sales record and pay the exact commission in test FXRP on Flare.",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="appshell">
      <AppNav />
      <div className="appmain">
        <header className="apptop">
          <div>
            <div className="apptop__title">Commission payments</div>
            <div className="apptop__sub">Test mode on Flare</div>
          </div>
          <div className="apptop__right">
            <span className="wallet">
              <span className="dot" style={{ background: "var(--tone-retry)" }} />
              Test mode
            </span>
            <AppWalletDisconnect />
          </div>
        </header>
        <div className="appbody">{children}</div>
      </div>
    </div>
  );
}
