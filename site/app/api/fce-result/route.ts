import { NextResponse } from "next/server";
import {
  decodeAbiParameters,
  encodeAbiParameters,
  isAddress,
  isHex,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { payableResultParameter } from "@/lib/jorqeth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_UNAVAILABLE = "Private verification is temporarily unavailable. No payout was made.";
const PRIVATE_SLOW = "Your private check is taking longer than expected. Try again.";
const PRIVATE_INVALID = "We couldn’t verify this result, so no payout was made.";

type ActionResultPayload = {
  result?: {
    id?: unknown;
    submissionTag?: unknown;
    status?: unknown;
    version?: unknown;
    data?: unknown;
  };
  signature?: unknown;
};

type DecodedPayableResult = {
  schemaVersion: number | bigint;
  campaignId: Hex;
  orderDigest: Hex;
  creator: Address;
  amount: bigint;
  eligibilityCode: number | bigint;
  chainId: bigint;
  settlementContract: Address;
  ruleVersion: Hex;
  nonce: Hex;
  issuedAt: bigint;
  expiry: bigint;
};

function proxyBaseUrl() {
  const configured = process.env.JORQETH_FCE_PROXY_URL?.trim().replace(/\/+$/, "");
  if (!configured || !/^https?:\/\//i.test(configured)) return undefined;
  return configured;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function validInstructionId(value: string | null): value is Hex {
  return Boolean(value && isHex(value) && value.length === 66);
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function healthResponse() {
  const baseUrl = proxyBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({ configured: false, ready: false }, { status: 503 });
  }

  try {
    const response = await fetchWithTimeout(`${baseUrl}/info`);
    return NextResponse.json(
      { configured: true, ready: response.ok },
      { status: response.ok ? 200 : 503 },
    );
  } catch (error) {
    console.error("FCE proxy readiness check failed", error);
    return NextResponse.json({ configured: true, ready: false }, { status: 503 });
  }
}

function decodeResult(data: Hex) {
  const [decoded] = decodeAbiParameters([payableResultParameter], data) as [DecodedPayableResult];
  if (
    !isAddress(decoded.creator) ||
    !isAddress(decoded.settlementContract) ||
    decoded.schemaVersion === undefined ||
    decoded.eligibilityCode === undefined ||
    decoded.chainId === undefined ||
    decoded.amount === undefined ||
    decoded.issuedAt === undefined ||
    decoded.expiry === undefined
  ) {
    throw new Error("invalid payable result");
  }

  return {
    schemaVersion: Number(decoded.schemaVersion),
    campaignId: decoded.campaignId,
    orderDigest: decoded.orderDigest,
    creator: decoded.creator,
    amount: decoded.amount.toString(),
    eligibilityCode: Number(decoded.eligibilityCode),
    chainId: decoded.chainId.toString(),
    settlementContract: decoded.settlementContract,
    ruleVersion: decoded.ruleVersion,
    nonce: decoded.nonce,
    issuedAt: decoded.issuedAt.toString(),
    expiry: decoded.expiry.toString(),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("health") === "1") return healthResponse();

  const instructionId = url.searchParams.get("instructionId");
  if (!validInstructionId(instructionId)) {
    return jsonError("Choose a valid private verification request.", 400);
  }

  const baseUrl = proxyBaseUrl();
  if (!baseUrl) return jsonError(PRIVATE_UNAVAILABLE, 503);

  let response: Response;
  try {
    response = await fetchWithTimeout(`${baseUrl}/action/result/${instructionId}`);
  } catch (error) {
    console.error("FCE result request failed", { instructionId, error });
    return jsonError(PRIVATE_UNAVAILABLE, 503);
  }

  if (response.status === 404 || response.status === 202) {
    return NextResponse.json({ pending: true }, { status: 202 });
  }
  if (!response.ok) {
    console.error("FCE result proxy returned an unexpected status", {
      instructionId,
      status: response.status,
    });
    return jsonError(PRIVATE_UNAVAILABLE, 503);
  }

  let payload: ActionResultPayload;
  try {
    payload = (await response.json()) as ActionResultPayload;
  } catch (error) {
    console.error("FCE result response was not JSON", { instructionId, error });
    return jsonError(PRIVATE_INVALID, 502);
  }

  const action = payload.result;
  const status = typeof action?.status === "number" ? action.status : undefined;
  if (!action || status === undefined || status >= 2) {
    return NextResponse.json({ pending: true }, { status: 202 });
  }
  if (status !== 1) {
    console.error("FCE action did not complete successfully", { instructionId, status });
    return jsonError(PRIVATE_UNAVAILABLE, 503);
  }

  const actionId = typeof action.id === "string" ? action.id : undefined;
  const submissionTag = typeof action.submissionTag === "string" ? action.submissionTag : undefined;
  const version = typeof action.version === "string" ? action.version : undefined;
  const data = typeof action.data === "string" ? action.data : undefined;
  const signature = typeof payload.signature === "string" ? payload.signature : undefined;
  if (
    !actionId ||
    actionId.toLowerCase() !== instructionId.toLowerCase() ||
    !submissionTag ||
    !version ||
    !data ||
    !isHex(data) ||
    !signature ||
    !isHex(signature) ||
    signature.length !== 132
  ) {
    console.error("FCE action result was incomplete", { instructionId });
    return jsonError(PRIVATE_INVALID, 502);
  }

  try {
    const result = decodeResult(data);
    if (result.eligibilityCode !== 0 && result.eligibilityCode !== 1) {
      console.error("FCE action returned a non-payable eligibility code", {
        instructionId,
        eligibilityCode: result.eligibilityCode,
      });
      return jsonError(PRIVATE_UNAVAILABLE, 503);
    }

    const proof = encodeAbiParameters(
      [
        { name: "instructionId", type: "bytes32" },
        { name: "submissionTag", type: "bytes" },
        { name: "status", type: "uint8" },
        { name: "signature", type: "bytes" },
      ],
      [instructionId, stringToHex(submissionTag), status, signature],
    );

    return NextResponse.json({
      instructionId,
      submissionTag,
      status,
      version,
      signature,
      proof,
      result,
    });
  } catch (error) {
    console.error("FCE result decoding failed", { instructionId, error });
    return jsonError(PRIVATE_INVALID, 502);
  }
}
