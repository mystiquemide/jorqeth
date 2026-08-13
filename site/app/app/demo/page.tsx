import type { Metadata } from "next";
import SettlementJourney from "@/components/SettlementJourney";

export const metadata: Metadata = {
  title: "Legacy mUSD FCE fallback",
  description:
    "Run Jorqeth's legacy mUSD Flare Confidential Compute fallback path. The primary app flow uses test FXRP.",
};

export default function DemoSettlementPage() {
  return <SettlementJourney />;
}
