import type { Metadata } from "next";
import SettlementJourney from "@/components/SettlementJourney";

export const metadata: Metadata = {
  title: "Settle a commission",
  description:
    "Create and fund a Coston2 commission campaign, run a private evaluation, settle the exact payout, and verify it paid once.",
};

export default function SettlementPage() {
  return <SettlementJourney />;
}
