"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { formatUnits, isAddress, type Address } from "viem";
import { coston2, publicClient, settlementAbi } from "@/lib/jorqeth";

const CAMPAIGN_KEY = "jorqeth.fceCampaign.fxrp";
const DECIMALS = 6;

type CurrentState = {
  campaign: Address;
  creator: Address;
  commissionBps: number;
  escrow: bigint;
  totalSettled: bigint;
};

function fxrp(value: bigint) {
  return formatUnits(value, DECIMALS);
}

export default function LivePaymentRoute({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const liveRoute = pathname === "/app/receipt" || pathname === "/app/inspector" || pathname === "/app/activity";
  const [state, setState] = useState<CurrentState>();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!liveRoute) return;
    let active = true;
    const saved = window.localStorage.getItem(CAMPAIGN_KEY);
    if (!saved || !isAddress(saved)) {
      setLoaded(true);
      return;
    }
    const campaign = saved as Address;
    void Promise.all([
      publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "creator" }),
      publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "commissionBps" }),
      publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "escrowBalance" }),
      publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "totalSettled" }),
    ]).then(([creator, commissionBps, escrow, totalSettled]) => {
      if (active) setState({ campaign, creator, commissionBps: Number(commissionBps), escrow, totalSettled });
    }).catch((error) => console.error("Could not read current Jorqeth payment:", error)).finally(() => {
      if (active) setLoaded(true);
    });
    return () => { active = false; };
  }, [liveRoute]);

  if (!liveRoute) return <>{children}</>;
  if (!loaded) return <div className="panel"><div className="panel__title">Loading your current payment…</div></div>;
  if (!state) return <div className="callout"><b>No current payment is saved in this browser.</b> Go back to Pay commission. Jorqeth will not label the old 3 FXRP demo as your latest payment.</div>;

  const rate = state.commissionBps / 100;
  const paid = fxrp(state.totalSettled);
  const balance = fxrp(state.escrow);
  const recipient = `${state.creator.slice(0, 8)}…${state.creator.slice(-6)}`;
  const contractUrl = `${coston2.blockExplorers.default.url}/address/${state.campaign}`;

  if (pathname === "/app/receipt") {
    return <>
      <div className="panel"><div className="payout-hero"><div className="payout-hero__badge">✓</div><div><div className="payout-hero__amt">+{paid}<span className="u">test FXRP paid</span></div><div className="payout-hero__meta"><span className="pill pill--paid"><span className="pd" />Current payment</span><span>{rate}% commission</span></div></div></div></div>
      <div className="grid-2"><div className="panel"><div className="panel__title">Latest commission</div><div className="kv"><div className="kv__row"><span className="kv__k">Commission rate</span><span className="kv__v">{rate}%</span></div><div className="kv__row"><span className="kv__k">Amount paid</span><span className="kv__v">{paid} test FXRP</span></div><div className="kv__row"><span className="kv__k">Recipient</span><span className="kv__v mono">{recipient}</span></div></div><Link className="btn btn--tinted docs-cta" href="/app/inspector">See why this amount</Link></div><div className="panel"><div className="panel__title">Payment state</div><div className="kv"><div className="kv__row"><span className="kv__k">Status</span><span className="kv__v">{state.totalSettled > BigInt(0) ? "Paid" : "Not paid yet"}</span></div><div className="kv__row"><span className="kv__k">Balance left</span><span className="kv__v">{balance} test FXRP</span></div><div className="kv__row"><span className="kv__k">Network</span><span className="kv__v">Flare testnet</span></div></div></div></div>
      <div className="callout"><b>Read directly from your current payment contract.</b> The old 3 FXRP demo proof is not being substituted here.</div>
      <a className="btn btn--tinted" href={contractUrl} target="_blank" rel="noreferrer">Open payment contract on Flare</a>
    </>;
  }

  if (pathname === "/app/inspector") {
    return <>
      <div className="panel"><div className="panel__head"><div><div className="panel__title">Why {paid} test FXRP?</div><div className="panel__sub">This view is reading the payment you currently have open in Jorqeth.</div></div><span className="pill pill--paid"><span className="pd" />{rate}% rule</span></div><div className="steps-v"><div className="step-v"><div className="step-v__i">01</div><div><div className="step-v__t">Private record checked</div><div className="step-v__d">The merchant record stayed private.</div></div></div><div className="step-v"><div className="step-v__i">02</div><div><div className="step-v__t">{rate}% commission rule</div><div className="step-v__d">This rate is read directly from the current payment contract.</div></div></div><div className="step-v"><div className="step-v__i">03</div><div><div className="step-v__t">{paid} test FXRP paid</div><div className="step-v__d">This paid total is read directly from the same contract.</div></div></div></div></div>
      <div className="callout"><b>Current payment:</b> {rate}% commission, {paid} test FXRP paid, {balance} test FXRP remaining.</div>
      <a className="btn btn--tinted" href={contractUrl} target="_blank" rel="noreferrer">Open payment contract on Flare</a>
    </>;
  }

  return <>
    <div className="panel"><div className="panel__head"><div><div className="panel__title">Current payment</div><div className="panel__sub">Your current contract reports a {rate}% commission and {paid} test FXRP paid.</div></div><span className="pill pill--paid"><span className="pd" />Current state</span></div><div className="grid-4"><div className="metric"><div className="metric__k">Commission</div><div className="metric__v">{rate}%</div></div><div className="metric"><div className="metric__k">Amount paid</div><div className="metric__v">{paid}</div></div><div className="metric"><div className="metric__k">Balance left</div><div className="metric__v">{balance}</div></div><div className="metric"><div className="metric__k">Result</div><div className="metric__v">{state.totalSettled > BigInt(0) ? "Paid" : "Open"}</div></div></div></div>
    <div className="callout"><b>Current Flare state loaded.</b> This page no longer falls back to the old 3 FXRP result when a current payment exists.</div>
    <a className="btn btn--tinted" href={contractUrl} target="_blank" rel="noreferrer">Open payment contract on Flare</a>
  </>;
}
