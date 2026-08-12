import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const instructionPattern = /^0x[0-9a-fA-F]{64}$/;

export async function GET(request: NextRequest) {
  const proxyUrl = process.env.JORQETH_FCE_PROXY_URL?.replace(/\/$/, "");
  if (request.nextUrl.searchParams.get("health") === "1") {
    return NextResponse.json(
      { configured: Boolean(proxyUrl) },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const instructionId = request.nextUrl.searchParams.get("instructionId") || "";
  if (!instructionPattern.test(instructionId)) {
    return NextResponse.json({ error: "A valid FCE instruction ID is required." }, { status: 400 });
  }

  if (!proxyUrl) {
    return NextResponse.json(
      {
        error:
          "The public FCE result proxy is not configured. Set JORQETH_FCE_PROXY_URL to the HTTPS tee-proxy endpoint.",
      },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(`${proxyUrl}/action/result/${instructionId}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "application/json" },
    });

    if (response.status === 404 || response.status === 202) {
      return NextResponse.json({ pending: true }, { status: 202 });
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: `FCE proxy returned HTTP ${response.status}.` },
        { status: 502 },
      );
    }

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "FCE proxy returned an invalid response." }, { status: 502 });
    }

    const action = payload as {
      result?: {
        id?: unknown;
        submissionTag?: unknown;
        status?: unknown;
        log?: unknown;
        data?: unknown;
      };
      signature?: unknown;
      proxySignature?: unknown;
    };

    if (
      !action.result ||
      typeof action.result.id !== "string" ||
      typeof action.result.submissionTag !== "string" ||
      typeof action.result.status !== "number" ||
      typeof action.result.log !== "string" ||
      typeof action.result.data !== "string" ||
      typeof action.signature !== "string"
    ) {
      return NextResponse.json({ error: "FCE proxy response is missing signed result fields." }, { status: 502 });
    }

    if (action.result.id.toLowerCase() !== instructionId.toLowerCase()) {
      return NextResponse.json({ error: "FCE proxy returned a result for a different instruction." }, { status: 502 });
    }

    if (action.result.status === 2) {
      return NextResponse.json({ pending: true }, { status: 202 });
    }

    return NextResponse.json(action, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("FCE result polling failed", error);
    return NextResponse.json(
      { error: "The FCE result proxy could not be reached." },
      { status: 502 },
    );
  }
}
