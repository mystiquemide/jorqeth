import { notFound } from "next/navigation";
import { LandingPage, type LandingSection } from "@/app/page";

const SECTIONS = {
  how: "how",
  proof: "outcomes",
  security: "security",
  faq: "faq",
} as const satisfies Record<string, LandingSection>;

type SectionRoute = keyof typeof SECTIONS;

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(SECTIONS).map((section) => ({ section }));
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;

  if (!(section in SECTIONS)) notFound();

  return <LandingPage scrollTo={SECTIONS[section as SectionRoute]} />;
}
