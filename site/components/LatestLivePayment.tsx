"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits, isAddress, type Address } from "viem";
import { coston2, publicClient, settlementAbi } from "@/lib/jorqeth";

const CAMPAIGN_KEY = "jorqeth.fceCampaign.fxrp";
const EXPLORER = coston2.blockExplorers.default.url;
const ASSET_DECIMALS = 6;

type View = "receipt" | "why" | "checks";

type CurrentCampaign = {
  campaign: Address;
  creator: Address;
  merchant: Address;
  commissionBps: number;
  escrowBalance: bigint;
  totalSettled: bigint;
};

async function loadCurrentCampaign(): Promise<CurrentCampaign | undefined> {
  const savedCampaign = window.localStorage.getItem(CAMPAIGN_KEY);
  if (!savedCampaign || !isAddress(savedCampaign)) return undefined;

  const campaign = savedCampaign as Address;
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
    escrowBalance,
    totalSettled,
  };
}

function fxrp(value: bigint) {
  return formatUnits(value, ASSET_DECIMALS);
}

function shortAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function Loading() {
  return (
    <div className="panel">
      <div className="panel__title">Loading your current payment…</div>
      <div className="panel__sub">Jorqeth is reading the saved payment contract directly from Flare Coston2.</div>
    </div>
  );
}

function MissingCampaign() {
  return (
    <div className="panel">
      <div className="panel__title">No current payment is saved in this browser.</div>
      <div className="panel__sub" style={{ marginTop: 8 }}>
        Open Pay commission and create or reopen a payment first. Jorqeth will not substitute an unrelated historical demo here.
      </div>
      <Link className="btn btn--primary docs-cta" href="/app">Go to Pay commission</Link>
    </div>
  );
}

function NoCompletedPayment({ campaign }: { campaign: CurrentCampaign }) {
  return (
    <>
      <div className="panel">
        <div className="panel__head">
          <div>
            <div className="panel__title">No completed commission on this payment yet</div>
            <div className="panel__sub">This current payment uses a {campaign.commissionBps / 100}% commission rate.</div>
          </div>
          <span className="pill pill--retry"><span className="pd" />Waiting for payment</span>
        </div>
      </div>
      <div className="callout">
        The current payment has {fxrp(campaign.escrowBalance)} test FXRP available and {fxrp(campaign.totalSettled)} test FXRP settled so far.
      </div>
      <div className="hero__actions">
        <Link className="btn btn--primary" href="/app">Continue payment</Link>
        <a className="btn btn--tinted" href={`${EXPLORER}/address/${campaign.campaign}`} target="_blank" rel="noreferrer">Open payment contract</a>
      </div>
    </>
  );
}

function ReceiptView({ campaign }: { campaign: CurrentCampaign }) {
  return (
    <>
      <div className="panel">
        <div className="payout-hero">
          <div className="payout-hero__badge">✓</div>
          <div>
            <div className="payout-hero__amt">+{fxrp(campaign.totalSettled)}<span className="u">test FXRP paid</span></div>
            <div className="payout-hero__meta">
              <span className="pill pill--paid"><span className="pd" />Paid on Flare</span>
              <span>{campaign.commissionBps / 100}% commission</span>
            </div>
          </div>
        </div>
      </div>

      <div className="callout">
        <b>Current payment confirmed.</b> This browser&apos;s saved payment is configured at {campaign.commissionBps / 100}% and has settled {fxrp(campaign.totalSettled)} test FXRP on Flare.
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel__title" style={{ marginBottom: 16 }}>Current commission payment</div>
          <div className="kv">
            <div className="kv__row"><span className="kv__k">Commission rate</span><span className="kv__v">{campaign.commissionBps / 100}%</span></div>
            <div className="kv__row"><span className="kv__k">Paid from this payment</span><span className="kv__v">{fxrp(campaign.totalSettled)} test FXRP</span></div>
            <div className="kv__row"><span className="kv__k">Recipient</span><span className="kv__v mono">{shortAddress(campaign.creator)}</span></div>
            <div className="kv__row"><span className="kv__k">Private record</span><span className="kv__v">Checked without being published</span></div>
          </div>
          <Link className="btn btn--tinted docs-cta" href="/app/inspector">See why this amount</Link>
        </div>

        <div className="panel">
          <div className="panel__title" style={{ marginBottom: 16 }}>Payment state</div>
          <div className="kv">
            <div className="kv__row"><span className="kv__k">Status</span><span className="kv__v">Paid</span></div>
            <div className="kv__row"><span className="kv__k">Payment balance left</span><span className="kv__v">{fxrp(campaign.escrowBalance)} test FXRP</span></div>
            <div className="kv__row"><span className="kv__k">Funding wallet</span><span className="kv__v mono">{shortAddress(campaign.merchant)}</span></div>
            <div className="kv__row"><span className="kv__k">Network</span><span className="kv__v">Flare testnet</span></div>
          </div>
        </div>
      </div>

      <details className="panel">
        <summary className="panel__title">Technical proof</summary>
        <div className="kv" style={{ marginTop: 16 }}>
          <div className="kv__row"><span className="kv__k">Payment contract</span><span className="kv__v mono">{campaign.campaign}</span></div>
          <div className="kv__row"><span className="kv__k">On-chain total settled</span><span className="kv__v">{fxrp(campaign.totalSettled)} test FXRP</span></div>
        </div>
        <div className="hero__actions" style={{ marginTop: 16 }}>
          <a className="btn btn--tinted" href={`${EXPLORER}/address/${campaign.campaign}`} target="_blank" rel="noreferrer">Open payment contract on Flare</a>
        </div>
      </details>
    </>
  );
}

function WhyView({ campaign }: { campaign: CurrentCampaign }) {
  const rate = campaign.commissionBps / 100;
  return (
    <>
      <div className="panel">
        <div className="panel__head">
          <div>
            <div className="panel__title">Why {fxrp(campaign.totalSettled)} test FXRP?</div>
            <div className="panel__sub">This view is tied to the current saved payment, not the old 3 FXRP demo proof.</div>
          </div>
          <span className="pill pill--paid"><span className="pd" />Checked and paid</span>
        </div>
        <div className="steps-v">
          <div className="step-v"><div className="step-v__i">01</div><div><div className="step-v__t">The private record was checked</div><div className="step-v__d">The underlying merchant record stayed private while Jorqeth determined what could be paid.</div></div></div>
          <div className="step-v"><div className="step-v__i">02</div><div><div className="step-v__t">This payment uses a {rate}% commission rule</div><div className="step-v__d">The commission rate is read directly from the current Coston2 payment contract.</div></div></div>
          <div className="step-v"><div className="step-v__i">03</div><div><div className="step-v__t">{fxrp(campaign.totalSettled)} test FXRP has settled</div><div className="step-v__d">That total is read directly from the current payment&apos;s on-chain settled state.</div></div></div>
          <div className="step-v"><div className="step-v__i">04</div><div><div className="step-v__t">The recipient is fixed</div><div className="step-v__d">The payment can release commission only to {shortAddress(campaign.creator)}.</div></div></div>
          <div className="step-v"><div className="step-v__i">05</div><div><div className="step-v__t">The payment remains verifiable</div><div className="step-v__d">The payment contract and its current balances can be inspected directly on Flare.</div></div></div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel"><div className="panel__title" style={{ marginBottom: 16 }}>Amount checked</div><div className="kv"><div className="kv__row"><span className="kv__k">Commission rate</span><span className="kv__v">{rate}%</span></div><div className="kv__row"><span className="kv__k">Paid from this payment</span><span className="kv__v">{fxrp(campaign.totalSettled)} test FXRP</span></div><div className="kv__row"><span className="kv__k">Recipient</span><span className="kv__v mono">{shortAddress(campaign.creator)}</span></div><div className="kv__row"><span className="kv__k">Private sales record</span><span className="kv__v">Hidden</span></div></div></div>
        <div className="panel"><div className="panel__title" style={{ marginBottom: 16 }}>Settlement result</div><div className="kv"><div className="kv__row"><span className="kv__k">Amount settled</span><span className="kv__v">{fxrp(campaign.totalSettled)} test FXRP</span></div><div className="kv__row"><span className="kv__k">Balance left</span><span className="kv__v">{fxrp(campaign.escrowBalance)} test FXRP</span></div><div className="kv__row"><span className="kv__k">Status</span><span className="kv__v">Completed</span></div><div className="kv__row"><span className="kv__k">Network</span><span className="kv__v">Flare testnet</span></div></div></div>
      </div>

      <div className="hero__actions">
        <a className="btn btn--tinted" href={`${EXPLORER}/address/${campaign.campaign}`} target="_blank" rel="noreferrer">Open payment contract on Flare</a>
      </div>
    </>
  );
}

function ChecksView({ campaign }: { campaign: CurrentCampaign }) {
  const rate = campaign.commissionBps / 100;
  return (
    <div className="panel">
      <div className="panel__head">
        <div>
          <div className="panel__title">Current payment</div>
          <div className="panel__sub">{fxrp(campaign.totalSettled)} test FXRP has settled from this {rate}% commission payment.</div>
        </div>
        <span className="pill pill--paid"><span className="pd" />Paid</span>
      </div>
      <div className="grid-4" style={{ marginBottom: 22 }}>
        <div className="metric"><div className="metric__k">Commission</div><div className="metric__v">{rate}%</div></div>
        <div className="metric"><div className="metric__k">Amount paid</div><div className="metric__v">{fxrp(campaign.totalSettled)}</div></div>
        <div className="metric"><div className="metric__k">Balance left</div><div className="metric__v">{fxrp(campaign.escrowBalance)}</div></div>
        <div className="metric"><div className="metric__k">Result</div><div className="metric__v">Paid</div></div>
      </div>
      <div className="callout"><b>Current state verified on-chain.</b> These values come from the payment contract saved by the Pay commission flow in this browser.</div>
      <div className="hero__actions" style={{ marginTop: 16 }}>
        <a className="btn btn--tinted" href={`${EXPLORER}/address/${campaign.campaign}`} target="_blank" rel="noreferrer">Open payment contract on Flare</a>
      </div>
    </div>
  );
}

export default function LatestLivePayment({ view }: { view: View }) {
  const [campaign, setCampaign] = useState<CurrentCampaign>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void loadCurrentCampaign()
      .then((value) => {
        if (!active) return;
        setCampaign(value);
        setFailed(false);
      })
      .catch((error) => {
        console.error("Could not load current payment:", error);
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  if (loading) return <Loading />;
  if (failed) return <div className="panel"><div className="panel__title">Couldn&apos;t read the current payment.</div><div className="panel__sub" style={{ marginTop: 8 }}>Refresh this page or return to Pay commission. Jorqeth will not replace it with historical demo data.</div></div>;
  if (!campaign) return <MissingCampaign />;
  if (campaign.totalSettled === BigInt(0)) return <NoCompletedPayment campaign={campaign} />;
  if (view === "receipt") return <ReceiptView campaign={campaign} />;
  if (view === "why") return <WhyView campaign={campaign} />;
  return <ChecksView campaign={campaign} />;
}
