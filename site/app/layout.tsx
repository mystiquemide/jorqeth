import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted display / body / mono fonts. No CDN, nothing to break through a tunnel.
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
  title: "Jorqeth: get paid exactly what you earned",
  description:
    "Jorqeth reads the merchant's own record privately, works out the commission you're owed to the cent, and pays it out on-chain. No exposed ledgers, no trust-me math.",
  applicationName: "Jorqeth",
  icons: {
    icon: [
      { url: "/assets/favicon.svg", type: "image/svg+xml" },
      { url: "/assets/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/assets/apple-touch-icon.png" }],
  },
  openGraph: {
    title: "Jorqeth: get paid exactly what you earned",
    description:
      "Private, exact creator commission settlement. Proven on-chain, exact to the cent.",
    type: "website",
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
