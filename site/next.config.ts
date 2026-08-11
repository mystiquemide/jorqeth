import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Content-Security-Policy for a static, read-only dashboard.
//
// Every page is prerendered from committed JSON. There is no user input, no
// auth, no form submission, and no third-party subresource, so the XSS surface
// is minimal. We keep a conservative policy anyway.
//
// Why 'unsafe-inline' rather than a nonce: Next.js emits inline bootstrap
// scripts (self.__next_f RSC payload) and the app uses React inline style
// attributes. A nonce-based CSP requires a proxy that injects the nonce during
// SSR, which forces every route to render dynamically. For a fully static site
// that trade is not worth it, so inline is allowed and no external script or
// style origin is trusted.
//
// Dev needs 'unsafe-eval' and a websocket connection for React Fast Refresh.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
