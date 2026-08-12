import type { Metadata } from "next";
import SettlementJourney from "@/components/SettlementJourney";

export const metadata: Metadata = {
  title: "Disclosed-signer demo",
  description:
    "Run Jorqeth's disclosed-signer Coston2 demo path. The primary app flow uses Flare Confidential Compute.",
};

export default function DemoSettlementPage() {
  return <SettlementJourney />;
}
