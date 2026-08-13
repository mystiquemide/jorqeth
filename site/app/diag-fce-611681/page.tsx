import { parseEventLogs, type Hex } from "viem";
import { fceInstructionSenderAbi, publicClient } from "@/lib/jorqeth";

const TX = "0x611681d462701b56f572bd4e9821587303da1d048ac96b869a72f00b0467a028" as Hex;

export const dynamic = "force-static";

export default async function DiagnosticPage() {
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
    const response = await fetch(`https://jorqeth.vercel.app/api/fce-result?instructionId=${instructionId}`);
    resultStatus = response.status;
    const text = await response.text();
    try {
      resultBody = JSON.parse(text);
    } catch {
      resultBody = text;
    }
  }

  const diagnostic = {
    transaction: TX,
    receiptStatus: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
    logCount: receipt.logs.length,
    instructionId: instructionId ?? null,
    resultStatus,
    resultBody,
  };

  console.log("JORQETH_FCE_DIAGNOSTIC", JSON.stringify(diagnostic));
  return <pre>{JSON.stringify(diagnostic, null, 2)}</pre>;
}
