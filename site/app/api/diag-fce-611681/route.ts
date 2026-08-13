import { NextResponse } from "next/server";
import { parseEventLogs, type Hex } from "viem";
import { fceInstructionSenderAbi, publicClient } from "@/lib/jorqeth";

const TX = "0x611681d462701b56f572bd4e9821587303da1d048ac96b869a72f00b0467a028" as Hex;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const receipt = await publicClient.getTransactionReceipt({ hash: TX });
  const events = parseEventLogs({
    abi: fceInstructionSenderAbi,
    eventName: "EvaluationInstructionSent",
    logs: receipt.logs,
    strict: false,
  });
  const instructionId = events[0]?.args.instructionId;

  let resultStatus: number | null = null;
  let resultBody: unknown = null;

  if (instructionId) {
    const resultUrl = new URL("/api/fce-result", request.url);
    resultUrl.searchParams.set("instructionId", instructionId);
    const response = await fetch(resultUrl, { cache: "no-store" });
    resultStatus = response.status;
    const text = await response.text();
    try {
      resultBody = JSON.parse(text);
    } catch {
      resultBody = text;
    }
  }

  return NextResponse.json({
    transaction: TX,
    receiptStatus: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
    logCount: receipt.logs.length,
    instructionId: instructionId ?? null,
    resultStatus,
    resultBody,
  });
}
