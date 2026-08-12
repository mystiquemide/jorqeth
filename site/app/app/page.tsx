import type { Metadata } from "next";
import FceSettlementJourney from "@/components/FceSettlementJourney";

export const metadata: Metadata = {
  title: "Settle with Flare Confidential Compute",
  description:
    "Create a Coston2 campaign, fund escrow, run the private commission evaluation through Flare Confidential Compute, verify the signed TEE ActionResult, and settle the exact payout on Flare.",
};

export default function SettlementPage() {
  return <FceSettlementJourney />;
}
