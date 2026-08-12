import type { Metadata } from "next";
import FceSettlementJourney from "@/components/FceSettlementJourney";

export const metadata: Metadata = {
  title: "Private commission settlement on Flare",
  description:
    "Set the commission rule, fund the campaign, privately verify the agreed merchant record with Flare Confidential Compute, and settle the exact creator or affiliate commission on Coston2.",
};

export default function SettlementPage() {
  return <FceSettlementJourney />;
}
