import type { Metadata } from "next";
import FceSettlementJourney from "@/components/FceSettlementJourney";

export const metadata: Metadata = {
  title: "Settle with Flare FCE",
  description:
    "Create and fund a Coston2 campaign, evaluate through Flare Confidential Compute, verify the signed TEE result, and settle the exact payout once.",
};

export default function SettlementPage() {
  return <FceSettlementJourney />;
}
