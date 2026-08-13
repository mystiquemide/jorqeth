import type { Metadata } from "next";
import FxrpPaymentFlow from "@/components/FxrpPaymentFlow";

export const metadata: Metadata = {
  title: "Pay a private FXRP commission",
  description:
    "Choose who gets paid, add test FXRP, check the private order record, and pay the exact commission on Flare.",
};

export default function SettlementPage() {
  return <FxrpPaymentFlow />;
}
