import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const instructionPattern = /^0x[0-9a-fA-F]{64}$/;

function unavailableResponse() {
  return NextResponse.json(
    {
      code: "PRIVATE_VERIFICATION_UNAVAILABLE",
      error: "Private verification is temporarily unavailable. Try again shortly.",
    },
    { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

async function proxyReady(proxyUrl: string) {
  try {
    const response = await fetch(`${proxyUrl}/info`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
      headers: { Accept: "application/json" },
    });
    return response.ok;
  } catch (error) {
    console.error("FCE proxy readiness check failed", error);
    return false;
  }
}

export async function GET(request: NextRequest) {
  const proxyUrl = process.env.JORQETH_FCE_PROXY_URL?.replace(/\/$/, "");

  if (request.nextUrl.searchParams.get("health") === "1") {
    if (!proxyUrl) {
      return NextResponse.json(
        { configured: false, ready: false },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    const ready = await proxyReady(proxyUrl);
    // `configured` intentionally tracks usability for backward compatibility with the
    // current client, while `ready` makes the health contract explicit.
    return NextResponse.json(
      { configured: ready, ready },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const instructionId = request.nextUrl.searchParams.get("instructionId") || "";
  if (!instructionPattern.test(instructionId)) {
    console.error("FCE result request rejected: invalid instruction ID format");
    return NextResponse.json(
      { code: "INVALID_VERIFICATION_REQUEST", error: "We couldn’t start this private verification. Please try again." },
      { status: 400 },
    );
  }

  if (!proxyUrl) {
    console.error("FCE result proxy unavailable: server-only proxy URL is not configured");
    return NextResponse.json(
      {
        code: "PRIVATE_VERIFICATION_NOT_CONFIGURED",
        error: "Private verification is temporarily unavailable. Try again shortly.",
      },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
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
      console.error(`FCE result proxy returned HTTP ${response.status}`);
      return unavailableResponse();
    }

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") {
      console.error("FCE result proxy returned a non-object response");
      return unavailableResponse();
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
      console.error("FCE result proxy response is missing required signed-result fields");
      return unavailableResponse();
    }

    if (action.result.id.toLowerCase() !== instructionId.toLowerCase()) {
      console.error("FCE result proxy returned a result for a different instruction ID");
      return unavailableResponse();
    }

    if (action.result.status === 2) {
      return NextResponse.json({ pending: true }, { status: 202 });
    }

    return NextResponse.json(action, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("FCE result polling failed", error);
    return unavailableResponse();
  }
}
