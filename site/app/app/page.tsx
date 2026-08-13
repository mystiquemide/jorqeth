import type { Metadata } from "next";
import FceSettlementJourney from "@/components/FceSettlementJourney";

const fxrpEnabled = Boolean(process.env.NEXT_PUBLIC_JORQETH_FXRP_FACTORY_ADDRESS);

export const metadata: Metadata = fxrpEnabled
  ? {
      title: "Private FXRP commission settlement on Flare",
      description:
        "Fund a campaign with test FXRP, privately verify the agreed merchant record with Flare Confidential Compute, and settle the exact XRP-denominated creator or affiliate commission on Coston2.",
    }
  : {
      title: "Private commission settlement on Flare",
      description:
        "Set the commission rule, fund the campaign, privately verify the agreed merchant record with Flare Confidential Compute, and settle the exact creator or affiliate commission on Coston2.",
    };

export default function SettlementPage() {
  return <FceSettlementJourney />;
}
