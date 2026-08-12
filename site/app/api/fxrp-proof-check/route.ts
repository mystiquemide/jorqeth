import { NextResponse } from "next/server";
import { decodeEventLog } from "viem";
import {
  COSTON2_FTEST_XRP_ADDRESS,
  erc20Abi,
  fceInstructionSenderAbi,
  publicClient,
  settlementAbi,
} from "@/lib/jorqeth";

const CAMPAIGN = "0x07D1251A5D94C7e833215016EBBbB774833091b4" as const;
const VERIFICATION_TX = "0xae3394fd31f5023616ab14099b5ad1628ac0b6c617af100e3c5e8083bf687ece" as const;
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

const settledEventAbi = [
  {
    type: "event",
    name: "Settled",
    anonymous: false,
    inputs: [
      { name: "campaignId", type: "bytes32", indexed: true },
      { name: "orderDigest", type: "bytes32", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "eligibilityCode", type: "uint8", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const dynamic = "force-dynamic";

export async function GET() {
  const [verificationReceipt, settlementReceipt, code] = await Promise.all([
    publicClient.getTransactionReceipt({ hash: VERIFICATION_TX }),
    publicClient.getTransactionReceipt({ hash: SETTLEMENT_TX }),
    publicClient.getCode({ address: CAMPAIGN }),
  ]);

  const blockNumber = settlementReceipt.blockNumber;
  const [token, verifier, creator, merchant, commissionBps, campaignId, ruleVersion, escrowBalance, totalSettled] =
    await Promise.all([
      publicClient.readContract({ address: CAMPAIGN, abi: tokenAbi, functionName: "token", blockNumber }),
      publicClient.readContract({ address: CAMPAIGN, abi: settlementAbi, functionName: "verifier", blockNumber }),
      publicClient.readContract({ address: CAMPAIGN, abi: settlementAbi, functionName: "creator", blockNumber }),
      publicClient.readContract({ address: CAMPAIGN, abi: settlementAbi, functionName: "merchant", blockNumber }),
      publicClient.readContract({ address: CAMPAIGN, abi: settlementAbi, functionName: "commissionBps", blockNumber }),
      publicClient.readContract({ address: CAMPAIGN, abi: settlementAbi, functionName: "campaignId", blockNumber }),
      publicClient.readContract({ address: CAMPAIGN, abi: settlementAbi, functionName: "ruleVersion", blockNumber }),
      publicClient.readContract({ address: CAMPAIGN, abi: settlementAbi, functionName: "escrowBalance", blockNumber }),
      publicClient.readContract({ address: CAMPAIGN, abi: settlementAbi, functionName: "totalSettled", blockNumber }),
    ]);

  const settledLog = settlementReceipt.logs
    .map((log) => {
      try {
        return decodeEventLog({ abi: settledEventAbi, data: log.data, topics: log.topics });
      } catch {
        return undefined;
      }
    })
    .find((entry) => entry?.eventName === "Settled");

  const instructionLog = verificationReceipt.logs
    .map((log) => {
      try {
        return decodeEventLog({ abi: fceInstructionSenderAbi, data: log.data, topics: log.topics });
      } catch {
        return undefined;
      }
    })
    .find((entry) => entry?.eventName === "EvaluationInstructionSent");

  const creatorBalance = await publicClient.readContract({
    address: COSTON2_FTEST_XRP_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [creator],
    blockNumber,
  });

  return NextResponse.json({
    campaign: CAMPAIGN,
    codePresent: Boolean(code && code !== "0x"),
    token,
    verifier,
    creator,
    merchant,
    commissionBps: Number(commissionBps),
    campaignId,
    ruleVersion,
    escrowBalance: escrowBalance.toString(),
    totalSettled: totalSettled.toString(),
    creatorBalance: creatorBalance.toString(),
    verification: {
      hash: VERIFICATION_TX,
      status: verificationReceipt.status,
      blockNumber: verificationReceipt.blockNumber.toString(),
      gasUsed: verificationReceipt.gasUsed.toString(),
      instruction: instructionLog?.eventName === "EvaluationInstructionSent" ? instructionLog.args : null,
    },
    settlement: {
      hash: SETTLEMENT_TX,
      status: settlementReceipt.status,
      blockNumber: settlementReceipt.blockNumber.toString(),
      gasUsed: settlementReceipt.gasUsed.toString(),
      settled: settledLog?.eventName === "Settled" ? settledLog.args : null,
    },
  });
}
