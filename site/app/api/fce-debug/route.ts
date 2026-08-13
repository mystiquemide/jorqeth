import { NextResponse } from "next/server";
import { createPublicClient, defineChain, http, parseAbiItem } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const chain = defineChain({
  id: 114,
  name: "Flare Testnet Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: ["https://coston2-api.flare.network/ext/C/rpc"] } },
});

const client = createPublicClient({ chain, transport: http() });
const sender = "0x86bE7C32A5E566b105a224F94b3A2Ed3F751d097" as const;
const requester = "0x9f758be3ae3D985713964339E2f0bD783fC6015c" as const;
const sentEvent = parseAbiItem("event EvaluationInstructionSent(bytes32 indexed instructionId, address indexed requester)");

export async function GET() {
  try {
    const latest = await client.getBlockNumber();
    const fromBlock = latest > 5000n ? latest - 5000n : 0n;
    const logs = await client.getLogs({
      address: sender,
      event: sentEvent,
      args: { requester },
      fromBlock,
      toBlock: latest,
    });

    return NextResponse.json({
      latest: latest.toString(),
      fromBlock: fromBlock.toString(),
      instructions: logs.slice(-10).map((log) => ({
        instructionId: log.args.instructionId,
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber?.toString(),
      })),
    }, {
      headers: { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "unknown" }, { status: 502 });
  }
}
