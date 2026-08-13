import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const proxyUrl = process.env.JORQETH_FCE_PROXY_URL?.replace(/\/$/, "");
  if (!proxyUrl) return NextResponse.json({ configured: false }, { status: 503 });

  try {
    const response = await fetch(`${proxyUrl}/info`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "application/json" },
    });
    const text = await response.text();
    let info: unknown = text;
    try { info = JSON.parse(text); } catch {}
    return NextResponse.json({ configured: true, status: response.status, info }, {
      headers: { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex" },
    });
  } catch (error) {
    return NextResponse.json({ configured: true, error: error instanceof Error ? error.message : "unknown" }, { status: 502 });
  }
}
