import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./landing-bleed.css";

const generalSans = localFont({
  variable: "--font-general-sans",
  display: "swap",
  src: [
    { path: "../public/fonts/general-sans-500.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/general-sans-600.woff2", weight: "600", style: "normal" },
  ],
});

const inter = localFont({
  variable: "--font-inter",
  display: "swap",
  src: [{ path: "../public/fonts/inter.woff2", weight: "100 900", style: "normal" }],
});

const jbMono = localFont({
  variable: "--font-jbmono",
  display: "swap",
  src: [{ path: "../public/fonts/jbmono.woff2", weight: "100 800", style: "normal" }],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://jorqeth.app"),
  title: {
    default: "Jorqeth: private commissions on Flare",
    template: "%s · Jorqeth",
  },
  description:
    "Private commission settlement built on Flare. Jorqeth uses Flare Confidential Compute to evaluate private merchant records and settle exact creator commissions on Coston2 without exposing the underlying ledger.",
  applicationName: "Jorqeth",
  icons: {
    icon: [
      { url: "/assets/favicon.svg", type: "image/svg+xml" },
      { url: "/assets/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/assets/apple-touch-icon.png" }],
  },
  openGraph: {
    title: "Jorqeth: private commissions on Flare",
    description:
      "Private merchant records in. Exact creator commissions out. Powered by Flare Confidential Compute and settled on Coston2.",
    url: "/",
    siteName: "Jorqeth",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/assets/og.png",
        width: 1200,
        height: 630,
        alt: "Jorqeth: private commission settlement built on Flare",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Jorqeth: private commissions on Flare",
    description:
      "Private commission settlement powered by Flare Confidential Compute and settled on Coston2.",
    images: ["/assets/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0FA36B",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${generalSans.variable} ${inter.variable} ${jbMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
