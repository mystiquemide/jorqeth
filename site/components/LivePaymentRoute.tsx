"use client";

import { usePathname } from "next/navigation";
import LatestLivePayment from "@/components/LatestLivePayment";

export default function LivePaymentRoute({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/app/receipt") return <LatestLivePayment view="receipt" />;
  if (pathname === "/app/inspector") return <LatestLivePayment view="why" />;
  if (pathname === "/app/activity") return <LatestLivePayment view="checks" />;
  return <>{children}</>;
}
