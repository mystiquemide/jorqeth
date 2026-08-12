import { NextResponse } from "next/server";
import { decodeEventLog, parseAbiItem } from "viem";
import {
  erc20Abi,
  fceInstructionSenderAbi,
  publicClient,
  settlementAbi,
} from "@/lib/jorqeth";

const CAMPAIGN = "0x07D1251A5D94C7e833215016EBBbB774833091b4" as const;
const INSTRUCTION_TX = "0xae3394fd31f5023616ab14099b5ad1628ac0b6c617af100e3c5e8083bf687ece" as const;
const SETTLEMENT_TX = "0xe14e3665278e716e12b1fff34f330fc38acfe0ff844dbea41aa9a8215f08e089" as const;

const tokenAbi = [
  {
    type: "function",
    name: "token",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const settledEvent = parseAbiItem(
  "event Settled(bytes32 indexed campaignId, bytes32 indexed orderDigest, address indexed creator, uint8 eligibilityCode, uint256 amount)",
);

export async function GET() {
  const [
    token,
    verifier,
    creator,
    merchant,
    commissionBps,
    escrowBalance,
    totalSettled,
    campaignId,
    ruleVersion,
    campaignEnd,
    instructionReceipt,
    settlementReceipt,
  ] = await Promise.all([
    publicClient.readContract({ address: CAMPAIGN, abi: tokenAbi, functionName: "token" }),
    publicClient.readContract({ address: CAMPAIGN, abi: settlementAbi, functionName: "verifier" }),
    publicClient.readContract({ address: CAMPAIGN, abi: settlementAbi, functionName: "creator" }),
    publicClient.readContract({ address: CAMPAIGN, abi: settlementAbi, functionName: "merchant" }),
    publicClient.readContract({ address: CAMPAIGN, abi: settlementAbi, functionName: "commissionBps" }),
    publicClient.readContract({ address: CAMPAIGN, abi: settlementAbi, functionName: "escrowBalance" }),
    publicClient.readContract({ address: CAMPAIGN, abi: settlementAbi, functionName: "totalSettled" }),
    publicClient.readContract({ address: CAMPAIGN, abi: settlementAbi, functionName: "campaignId" }),
    publicClient.readContract({ address: CAMPAIGN, abi: settlementAbi, functionName: "ruleVersion" }),
    publicClient.readContract({ address: CAMPAIGN, abi: settlementAbi, functionName: "campaignEnd" }),
    publicClient.getTransactionReceipt({ hash: INSTRUCTION_TX }),
    publicClient.getTransactionReceipt({ hash: SETTLEMENT_TX }),
  ]);

  let instructionId: string | undefined;
  let requester: string | undefined;
  for (const log of instructionReceipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: fceInstructionSenderAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === "EvaluationInstructionSent") {
        instructionId = decoded.args.instructionId;
        requester = decoded.args.requester;
        break;
      }
    } catch {}
  }

  let settled:
    | { orderDigest: string; creator: string; eligibilityCode: number; amount: string }
    | undefined;
  for (const log of settlementReceipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: [settledEvent], data: log.data, topics: log.topics });
      if (decoded.eventName === "Settled") {
        settled = {
          orderDigest: decoded.args.orderDigest,
          creator: decoded.args.creator,
          eligibilityCode: decoded.args.eligibilityCode,
          amount: decoded.args.amount.toString(),
        };
        break;
      }
    } catch {}
  }

  const [merchantBalance, creatorBalance] = await Promise.all([
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [merchant] }),
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [creator] }),
  ]);

  return NextResponse.json({
    campaign: CAMPAIGN,
    token,
    verifier,
    creator,
    merchant,
    commissionBps,
    escrowBalance: escrowBalance.toString(),
    totalSettled: totalSettled.toString(),
    campaignId,
    ruleVersion,
    campaignEnd: campaignEnd.toString(),
    balances: { merchant: merchantBalance.toString(), creator: creatorBalance.toString() },
    instruction: {
      tx: INSTRUCTION_TX,
      status: instructionReceipt.status,
      blockNumber: instructionReceipt.blockNumber.toString(),
      gasUsed: instructionReceipt.gasUsed.toString(),
      instructionId,
      requester,
    },
    settlement: {
      tx: SETTLEMENT_TX,
      status: settlementReceipt.status,
      blockNumber: settlementReceipt.blockNumber.toString(),
      gasUsed: settlementReceipt.gasUsed.toString(),
      event: settled,
    },
  });
}
