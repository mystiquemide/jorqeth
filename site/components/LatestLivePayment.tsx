"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits, isAddress, parseAbiItem, type Address, type Hex } from "viem";
import { coston2, publicClient, settlementAbi } from "@/lib/jorqeth";
import { liveProof } from "@/lib/live-proof";

const CAMPAIGN_KEY = "jorqeth.fceCampaign.fxrp";
const EXPLORER = coston2.blockExplorers.default.url;
const ASSET_DECIMALS = 6;
const SETTLED_EVENT = parseAbiItem(
  "event Settled(bytes32 indexed campaignId, bytes32 indexed orderDigest, address indexed creator, uint8 eligibilityCode, uint256 amount)",
);

type LivePayment = {
  campaign: Address;
  creator: Address;
  merchant: Address;
  commissionBps: number;
  amount: bigint;
  escrowBalance: bigint;
  totalSettled: bigint;
  orderDigest: Hex;
  settlementTx: Hex;
  blockNumber: bigint;
};

type View = "receipt" | "why" | "checks";

async function findLatestSettlement(campaign: Address) {
  const latestBlock = await publicClient.getBlockNumber();
  const chunk = BigInt(10_000);
  const floor = latestBlock > BigInt(100_000) ? latestBlock - BigInt(100_000) : BigInt(0);
  let toBlock = latestBlock;

  while (toBlock >= floor) {
    const fromBlock = toBlock > chunk ? toBlock - chunk + BigInt(1) : BigInt(0);
    const logs = await publicClient.getLogs({
      address: campaign,
      event: SETTLED_EVENT,
      fromBlock: fromBlock < floor ? floor : fromBlock,
      toBlock,
    });
    if (logs.length > 0) return logs[logs.length - 1];
    if (fromBlock <= floor || fromBlock === BigInt(0)) break;
    toBlock = fromBlock - BigInt(1);
  }
  return undefined;
}

async function loadCurrentPayment(): Promise<LivePayment | undefined> {
  const savedCampaign = window.localStorage.getItem(CAMPAIGN_KEY);
  if (!savedCampaign || !isAddress(savedCampaign)) return undefined;
  const campaign = savedCampaign as Address;
  const latest = await findLatestSettlement(campaign);
  if (!latest?.transactionHash || latest.args.amount === undefined || !latest.args.creator || !latest.args.orderDigest) return undefined;

  const [creator, merchant, commissionBps, escrowBalance, totalSettled] = await Promise.all([
    publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "creator" }),
    publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "merchant" }),
    publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "commissionBps" }),
    publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "escrowBalance" }),
    publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "totalSettled" }),
  ]);

  return {
    campaign,
    creator,
    merchant,
    commissionBps: Number(commissionBps),
    amount: latest.args.amount,
    escrowBalance,
    totalSettled,
    orderDigest: latest.args.orderDigest,
    settlementTx: latest.transactionHash,
    blockNumber: latest.blockNumber,
  };
}

function shortAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function amount(value: bigint) {
  return formatUnits(value, ASSET_DECIMALS);
}

function Loading() {
  return <div className="panel"><div className="panel__title">Loading your latest payment…</div><div className="panel__sub">Jorqeth is reading the current payment directly from Flare.</div></div>;
}

function FallbackNotice() {
  return <div className="callout"><b>No newer completed payment was found in this browser.</b> Showing the last committed successful Coston2 demo proof instead.</div>;
}

function ReceiptView({ payment }: { payment: LivePayment }) {
  return <>
    <div className="panel"><div className="payout-hero"><div className="payout-hero__badge">✓</div><div><div className="payout-hero__amt">+{amount(payment.amount)}<span className="u">test FXRP</span></div><div className="payout-hero__meta"><span className="pill pill--paid"><span className="pd" />Paid on Flare</span><span>{payment.commissionBps / 100}% commission</span></div></div></div></div>
    <div className="callout"><b>Payment complete.</b> Jorqeth checked the private record, approved exactly {amount(payment.amount)} test FXRP, and the payment settled successfully on Flare.</div>
    <div className="grid-2">
      <div className="panel"><div className="panel__title" style={{ marginBottom: 16 }}>Latest commission</div><div className="kv"><div className="kv__row"><span className="kv__k">Commission rate</span><span className="kv__v">{payment.commissionBps / 100}%</span></div><div className="kv__row"><span className="kv__k">Amount paid</span><span className="kv__v">{amount(payment.amount)} test FXRP</span></div><div className="kv__row"><span className="kv__k">Recipient</span><span className="kv__v mono">{shortAddress(payment.creator)}</span></div><div className="kv__row"><span className="kv__k">Private record</span><span className="kv__v">Checked without being published</span></div></div><Link className="btn btn--tinted docs-cta" href="/app/inspector">See why this amount</Link></div>
      <div className="panel"><div className="panel__title" style={{ marginBottom: 16 }}>Payment state</div><div className="kv"><div className="kv__row"><span className="kv__k">Status</span><span className="kv__v">Paid</span></div><div className="kv__row"><span className="kv__k">Payment balance left</span><span className="kv__v">{amount(payment.escrowBalance)} test FXRP</span></div><div className="kv__row"><span className="kv__k">Total paid from this payment</span><span className="kv__v">{amount(payment.totalSettled)} test FXRP</span></div><div className="kv__row"><span className="kv__k">Network</span><span className="kv__v">Flare testnet</span></div></div></div>
    </div>
    <details className="panel"><summary className="panel__title">Technical proof</summary><div className="kv" style={{ marginTop: 16 }}><div className="kv__row"><span className="kv__k">Payment contract</span><span className="kv__v mono">{payment.campaign}</span></div><div className="kv__row"><span className="kv__k">Order fingerprint</span><span className="kv__v mono">{payment.orderDigest}</span></div><div className="kv__row"><span className="kv__k">Settlement block</span><span className="kv__v">{payment.blockNumber.toString()}</span></div></div><div className="hero__actions" style={{ marginTop: 16 }}><a className="btn btn--tinted" href={`${EXPLORER}/tx/${payment.settlementTx}`} target="_blank" rel="noreferrer">Open payment on Flare</a><a className="btn btn--tinted" href={`${EXPLORER}/address/${payment.campaign}`} target="_blank" rel="noreferrer">Open payment contract</a></div></details>
  </>;
}

function WhyView({ payment }: { payment: LivePayment }) {
  const checks = [
    ["01", "The private record was checked", "The underlying merchant record stayed private while Jorqeth determined the commission due."],
    ["02", "The result matched this payment", "The recipient, payment contract, network and commission rule had to match before funds could move."],
    ["03", `${payment.commissionBps / 100}% commission applied`, `The payment rule produced exactly ${amount(payment.amount)} test FXRP for this order.`],
    ["04", "The exact amount was paid", `${amount(payment.amount)} test FXRP was released to the recipient on Flare.`],
    ["05", "The order is now closed", "The same order fingerprint cannot be paid a second time from this payment."],
  ] as const;
  return <>
    <div className="panel"><div className="panel__head"><div><div className="panel__title">Why {amount(payment.amount)} test FXRP?</div><div className="panel__sub">This is the current completed payment from your Jorqeth session.</div></div><span className="pill pill--paid"><span className="pd" />Checked and paid</span></div><div className="steps-v">{checks.map(([n, title, desc]) => <div className="step-v" key={n}><div className="step-v__i">{n}</div><div style={{ minWidth: 0 }}><div className="step-v__t">{title}</div><div className="step-v__d">{desc}</div></div></div>)}</div></div>
    <div className="grid-2"><div className="panel"><div className="panel__title" style={{ marginBottom: 16 }}>Amount checked</div><div className="kv"><div className="kv__row"><span className="kv__k">Commission rate</span><span className="kv__v">{payment.commissionBps / 100}%</span></div><div className="kv__row"><span className="kv__k">Exact commission</span><span className="kv__v">{amount(payment.amount)} test FXRP</span></div><div className="kv__row"><span className="kv__k">Recipient</span><span className="kv__v mono">{shortAddress(payment.creator)}</span></div><div className="kv__row"><span className="kv__k">Private sales record</span><span className="kv__v">Hidden</span></div></div></div><div className="panel"><div className="panel__title" style={{ marginBottom: 16 }}>Settlement result</div><div className="kv"><div className="kv__row"><span className="kv__k">Amount paid</span><span className="kv__v">{amount(payment.amount)} test FXRP</span></div><div className="kv__row"><span className="kv__k">Balance left</span><span className="kv__v">{amount(payment.escrowBalance)} test FXRP</span></div><div className="kv__row"><span className="kv__k">Status</span><span className="kv__v">Completed</span></div><div className="kv__row"><span className="kv__k">Network</span><span className="kv__v">Flare testnet</span></div></div></div></div>
    <details className="panel"><summary className="panel__title">Technical proof</summary><div className="kv" style={{ marginTop: 16 }}><div className="kv__row"><span className="kv__k">Order fingerprint</span><span className="kv__v mono">{payment.orderDigest}</span></div><div className="kv__row"><span className="kv__k">Payment contract</span><span className="kv__v mono">{payment.campaign}</span></div><div className="kv__row"><span className="kv__k">Settlement transaction</span><span className="kv__v mono">{payment.settlementTx}</span></div></div><div className="hero__actions" style={{ marginTop: 16 }}><a className="btn btn--tinted" href={`${EXPLORER}/tx/${payment.settlementTx}`} target="_blank" rel="noreferrer">Open payment on Flare</a></div></details>
  </>;
}

function ChecksView({ payment }: { payment: LivePayment }) {
  return <div className="panel"><div className="panel__head"><div><div className="panel__title">Latest payment</div><div className="panel__sub">{amount(payment.amount)} test FXRP was checked and paid successfully at a {payment.commissionBps / 100}% commission rate.</div></div><span className="pill pill--paid"><span className="pd" />Paid</span></div><div className="grid-4" style={{ marginBottom: 22 }}><div className="metric"><div className="metric__k">Commission</div><div className="metric__v">{payment.commissionBps / 100}%</div></div><div className="metric"><div className="metric__k">Amount paid</div><div className="metric__v">{amount(payment.amount)}</div></div><div className="metric"><div className="metric__k">Balance left</div><div className="metric__v">{amount(payment.escrowBalance)}</div></div><div className="metric"><div className="metric__k">Result</div><div className="metric__v">Paid</div></div></div><div className="callout"><b>Completed safely.</b> The exact approved commission moved to the intended recipient, and the order is now marked as paid.</div><details style={{ marginTop: 16 }}><summary>Technical details</summary><div className="hero__actions" style={{ marginTop: 14 }}><a className="btn btn--tinted" href={`${EXPLORER}/tx/${payment.settlementTx}`} target="_blank" rel="noreferrer">Open payment on Flare</a><a className="btn btn--tinted" href={`${EXPLORER}/address/${payment.campaign}`} target="_blank" rel="noreferrer">Open payment contract</a></div></details></div>;
}

function StaticSuccessfulProof({ view }: { view: View }) {
  if (view === "receipt") return <><FallbackNotice /><div className="panel"><div className="payout-hero"><div className="payout-hero__badge">✓</div><div><div className="payout-hero__amt">+{liveProof.paidAmount}<span className="u">test FXRP</span></div><div className="payout-hero__meta"><span className="pill pill--paid"><span className="pd" />Paid on Flare</span><span>Committed Coston2 proof</span></div></div></div></div><div className="callout"><b>Completed demo proof.</b> The last committed proof paid {liveProof.paidAmount} test FXRP and left {liveProof.remainingEscrow} test FXRP in escrow.</div><div className="hero__actions"><a className="btn btn--tinted" href={liveProof.settlementUrl} target="_blank" rel="noreferrer">Open payment on Flare</a></div></>;
  if (view === "why") return <><FallbackNotice /><div className="panel"><div className="panel__title">Why {liveProof.paidAmount} test FXRP?</div><div className="panel__sub" style={{ marginTop: 8 }}>The committed successful Coston2 proof used a 3% commission on a 100-unit private record and paid exactly {liveProof.paidAmount} test FXRP.</div></div><div className="hero__actions"><a className="btn btn--tinted" href={liveProof.instructionUrl} target="_blank" rel="noreferrer">Open private check</a><a className="btn btn--tinted" href={liveProof.settlementUrl} target="_blank" rel="noreferrer">Open payment</a></div></>;
  return <><FallbackNotice /><div className="panel"><div className="panel__title">Committed successful demo</div><div className="panel__sub" style={{ marginTop: 8 }}>{liveProof.paidAmount} test FXRP was paid successfully, and the replay test was rejected.</div></div></>;
}

export default function LatestLivePayment({ view }: { view: View }) {
  const [payment, setPayment] = useState<LivePayment>();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void loadCurrentPayment().then((value) => { if (active) setPayment(value); }).catch((error) => console.error("Could not load latest live payment:", error)).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  if (loading) return <Loading />;
  if (!payment) return <StaticSuccessfulProof view={view} />;
  if (view === "receipt") return <ReceiptView payment={payment} />;
  if (view === "why") return <WhyView payment={payment} />;
  return <ChecksView payment={payment} />;
}
