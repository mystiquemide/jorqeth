import { NextResponse } from "next/server";
import {
  encodePacked,
  isAddress,
  isHex,
  keccak256,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  coston2,
  deployment,
  factoryAbi,
  payableResultTypes,
  publicClient,
  settlementAbi,
  verifierAbi,
  type PayableResult,
} from "@/lib/jorqeth";

export const runtime = "nodejs";

type PrivateRecord = {
  reference: string;
  class: "eligible" | "refunded" | "unmatched";
  netAmount: string;
};

function privateRecords(): PrivateRecord[] {
  const parsed: unknown = JSON.parse(process.env.JORQETH_PRIVATE_RECORDS_JSON || "[]");
  if (!Array.isArray(parsed)) throw new Error("records must be an array");

  return parsed.map((record) => {
    if (
      !record ||
      typeof record !== "object" ||
      typeof (record as PrivateRecord).reference !== "string" ||
      !["eligible", "refunded", "unmatched"].includes((record as PrivateRecord).class) ||
      !/^\d+$/.test((record as PrivateRecord).netAmount)
    ) {
      throw new Error("invalid private record");
    }
    return record as PrivateRecord;
  });
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const settlement =
      body && typeof body === "object" ? (body as { settlement?: unknown }).settlement : undefined;
    const reference =
      body && typeof body === "object" ? (body as { reference?: unknown }).reference : undefined;

    if (typeof settlement !== "string" || !isAddress(settlement)) {
      return NextResponse.json({ error: "Choose a valid campaign before evaluating." }, { status: 400 });
    }
    if (typeof reference !== "string" || !reference.trim() || reference.length > 160) {
      return NextResponse.json({ error: "Enter the agreed record reference." }, { status: 400 });
    }
    if (!deployment.factory || !deployment.verifier) {
      return NextResponse.json(
        { error: "The Coston2 campaign deployment is not configured yet." },
        { status: 503 },
      );
    }

    const evaluatorKey = process.env.JORQETH_EVALUATOR_PRIVATE_KEY;
    if (!evaluatorKey || !isHex(evaluatorKey) || evaluatorKey.length !== 66) {
      return NextResponse.json(
        { error: "Private evaluation is not configured for this deployment." },
        { status: 503 },
      );
    }

    const settlementAddress = settlement as Address;
    const isFactoryCampaign = await publicClient.readContract({
      address: deployment.factory,
      abi: factoryAbi,
      functionName: "isCampaign",
      args: [settlementAddress],
    });
    if (!isFactoryCampaign) {
      return NextResponse.json({ error: "This campaign was not created by Jorqeth." }, { status: 400 });
    }

    const [campaignId, creator, commissionBps, ruleVersion, campaignEnd, verifier] =
      await Promise.all([
        publicClient.readContract({ address: settlementAddress, abi: settlementAbi, functionName: "campaignId" }),
        publicClient.readContract({ address: settlementAddress, abi: settlementAbi, functionName: "creator" }),
        publicClient.readContract({ address: settlementAddress, abi: settlementAbi, functionName: "commissionBps" }),
        publicClient.readContract({ address: settlementAddress, abi: settlementAbi, functionName: "ruleVersion" }),
        publicClient.readContract({ address: settlementAddress, abi: settlementAbi, functionName: "campaignEnd" }),
        publicClient.readContract({ address: settlementAddress, abi: settlementAbi, functionName: "verifier" }),
      ]);

    if (verifier.toLowerCase() !== deployment.verifier.toLowerCase()) {
      return NextResponse.json({ error: "This campaign uses an unsupported evaluator." }, { status: 400 });
    }

    const evaluator = privateKeyToAccount(evaluatorKey as Hex);
    const trustedSigner = await publicClient.readContract({
      address: deployment.verifier,
      abi: verifierAbi,
      functionName: "trustedSigner",
    });
    if (trustedSigner.toLowerCase() !== evaluator.address.toLowerCase()) {
      return NextResponse.json(
        { error: "Private evaluation is not ready for this deployment." },
        { status: 503 },
      );
    }

    const record = privateRecords().find((item) => item.reference === reference.trim());
    if (!record) {
      return NextResponse.json(
        { error: "No agreed private record matches that reference." },
        { status: 404 },
      );
    }

    const eligibilityCode = record.class === "eligible" ? 1 : 0;
    const amount =
      eligibilityCode === 1
        ? (BigInt(record.netAmount) * BigInt(commissionBps)) / BigInt(10_000)
        : BigInt(0);
    // Use the chain clock so a small host-to-chain skew cannot create a result
    // whose issuance time appears to be in the future when it settles.
    const issuedAt = (await publicClient.getBlock({ blockTag: "latest" })).timestamp;
    const oneHour = BigInt(3600);
    const expiry = issuedAt + oneHour < campaignEnd ? issuedAt + oneHour : campaignEnd;
    if (expiry <= issuedAt + BigInt(60)) {
      return NextResponse.json(
        { error: "This campaign is too close to its end time for a new evaluation." },
        { status: 409 },
      );
    }

    const orderDigest = keccak256(toBytes(reference.trim()));
    const nonce = keccak256(encodePacked(["bytes32", "uint256"], [orderDigest, BigInt(Date.now())]));
    const result: PayableResult = {
      schemaVersion: 1,
      campaignId,
      orderDigest,
      creator,
      amount,
      eligibilityCode,
      chainId: BigInt(114),
      settlementContract: settlementAddress,
      ruleVersion,
      nonce,
      issuedAt,
      expiry,
    };

    const signature = await evaluator.signTypedData({
      domain: {
        name: "Jorqeth",
        version: "1",
        chainId: coston2.id,
        verifyingContract: settlementAddress,
      },
      types: payableResultTypes,
      primaryType: "PayableResult",
      message: result,
    });

    return NextResponse.json({
      result: {
        ...result,
        amount: result.amount.toString(),
        chainId: result.chainId.toString(),
        issuedAt: result.issuedAt.toString(),
        expiry: result.expiry.toString(),
      },
      signature,
      outcome: eligibilityCode === 1 ? "eligible" : "ineligible",
      commissionBps: Number(commissionBps),
    });
  } catch (error) {
    console.error("Evaluation failed", error);
    return NextResponse.json(
      { error: "The private evaluation could not finish. Try again shortly." },
      { status: 500 },
    );
  }
}
