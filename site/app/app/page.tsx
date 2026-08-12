import type { Metadata } from "next";
import FceSettlementJourney from "@/components/FceSettlementJourney";

export const metadata: Metadata = {
  title: "Private FXRP commission settlement on Flare",
  description:
    "Fund a campaign with test FXRP, privately verify the agreed merchant record with Flare Confidential Compute, and settle the exact XRP-denominated creator or affiliate commission on Coston2.",
};

export default function SettlementPage() {
  return <FceSettlementJourney />;
}
