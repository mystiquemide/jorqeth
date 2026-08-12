import { NextResponse } from "next/server";
import { publicClient } from "@/lib/jorqeth";

const FACTORY = "0xF5D10934c08955fcaCA7b1b5dAF59b99d86DEa99" as const;
const DEPLOYMENT_TX =
  "0xc9067b63ed6efd01794f89af25beb01011fec2df12488b3f660bed7fe3433a22" as const;

const factoryReadAbi = [
  {
    type: "function",
    name: "token",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "verifier",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export async function GET() {
  const [receipt, bytecode, token, verifier] = await Promise.all([
    publicClient.getTransactionReceipt({ hash: DEPLOYMENT_TX }),
    publicClient.getBytecode({ address: FACTORY }),
    publicClient.readContract({ address: FACTORY, abi: factoryReadAbi, functionName: "token" }),
    publicClient.readContract({ address: FACTORY, abi: factoryReadAbi, functionName: "verifier" }),
  ]);

  return NextResponse.json({
    factory: FACTORY,
    deploymentTx: DEPLOYMENT_TX,
    receiptStatus: receipt.status,
    contractAddress: receipt.contractAddress,
    hasBytecode: Boolean(bytecode && bytecode !== "0x"),
    token,
    verifier,
  });
}
