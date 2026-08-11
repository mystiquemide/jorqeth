"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  createWalletClient,
  custom,
  encodePacked,
  formatUnits,
  isAddress,
  keccak256,
  parseEventLogs,
  parseUnits,
  toBytes,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import {
  coston2,
  deployment,
  deploymentConfigured,
  factoryAbi,
  publicClient,
  settlementAbi,
  tokenAbi,
  type PayableResult,
} from "@/lib/jorqeth";

type Evaluation = {
  result: Omit<PayableResult, "amount" | "chainId" | "issuedAt" | "expiry"> & {
    amount: string;
    chainId: string;
    issuedAt: string;
    expiry: string;
  };
  signature: Hex;
  outcome: "eligible" | "ineligible";
  commissionBps: number;
};

type WalletProvider = EIP1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

const EXPLORER = coston2.blockExplorers.default.url;

function short(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function messageFrom(error: unknown, fallback: string) {
  if (error instanceof Error) {
    if (/rejected|denied|cancelled/i.test(error.message)) return "The wallet request was cancelled. You can try again when ready.";
    if (/insufficient funds/i.test(error.message)) return "This wallet needs C2FLR for network fees. Add faucet funds, then try again.";
  }
  return fallback;
}

function toPayableResult(evaluation: Evaluation): PayableResult {
  return {
    ...evaluation.result,
    amount: BigInt(evaluation.result.amount),
    chainId: BigInt(evaluation.result.chainId),
    issuedAt: BigInt(evaluation.result.issuedAt),
    expiry: BigInt(evaluation.result.expiry),
  };
}

export default function SettlementJourney() {
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [creator, setCreator] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("10");
  const [escrowAmount, setEscrowAmount] = useState("100");
  const [campaign, setCampaign] = useState<Address>();
  const [recordReference, setRecordReference] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation>();
  const [settlementHash, setSettlementHash] = useState<Hex>();
  const [verified, setVerified] = useState(false);
  const [escrowBalance, setEscrowBalance] = useState<bigint>(BigInt(0));
  const [totalSettled, setTotalSettled] = useState<bigint>(BigInt(0));
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  const provider = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return (window as typeof window & { ethereum?: WalletProvider }).ethereum;
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("jorqeth.campaign");
    if (saved && isAddress(saved)) setCampaign(saved);
  }, []);

  useEffect(() => {
    if (!provider) return;

    const accountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as Address[] | undefined;
      setAccount(accounts?.[0]);
      if (accounts?.[0]) setCreator((current) => current || accounts[0]);
    };
    const chainChanged = (...args: unknown[]) => {
      const next = args[0];
      if (typeof next === "string") setChainId(Number.parseInt(next, 16));
    };
    provider.on?.("accountsChanged", accountsChanged);
    provider.on?.("chainChanged", chainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", accountsChanged);
      provider.removeListener?.("chainChanged", chainChanged);
    };
  }, [provider]);

  useEffect(() => {
    if (!campaign) return;
    void refreshCampaign(campaign);
  }, [campaign]);

  const walletClient = () => {
    if (!provider || !account) throw new Error("Connect a wallet first.");
    return createWalletClient({ account, chain: coston2, transport: custom(provider) });
  };

  const clearMessages = () => {
    setError(undefined);
    setNotice(undefined);
  };

  async function connectWallet() {
    clearMessages();
    if (!provider) {
      setError("No browser wallet was found. Install MetaMask or another injected EVM wallet to continue.");
      return;
    }
    setBusy("connect");
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
      if (!accounts[0]) throw new Error("No wallet account returned.");
      const currentChain = Number.parseInt((await provider.request({ method: "eth_chainId" })) as string, 16);
      if (currentChain !== coston2.id) {
        try {
          await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x72" }] });
        } catch {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x72",
                chainName: coston2.name,
                nativeCurrency: coston2.nativeCurrency,
                rpcUrls: coston2.rpcUrls.default.http,
                blockExplorerUrls: [EXPLORER],
              },
            ],
          });
        }
      }
      setAccount(accounts[0]);
      setCreator((current) => current || accounts[0]);
      setChainId(coston2.id);
      setNotice("Wallet connected to Coston2.");
    } catch (cause) {
      setError(messageFrom(cause, "The wallet could not connect. Check the selected account and try again."));
    } finally {
      setBusy(undefined);
    }
  }

  async function createCampaign() {
    clearMessages();
    if (!deployment.factory) {
      setError("The Coston2 factory address has not been configured.");
      return;
    }
    if (!isAddress(creator)) {
      setError("Enter a valid payout wallet for the creator.");
      return;
    }
    const percent = Number(commissionPercent);
    const commissionBps = Math.round(percent * 100);
    if (!Number.isFinite(percent) || commissionBps < 1 || commissionBps > 10_000) {
      setError("Choose a commission rate between 0.01% and 100%.");
      return;
    }

    setBusy("create");
    try {
      const campaignId = keccak256(
        encodePacked(["address", "uint256"], [account as Address, BigInt(Date.now())]),
      );
      const ruleVersion = keccak256(toBytes(`jorqeth.floor.v1:${commissionBps}`));
      const campaignEnd = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);
      const hash = await walletClient().writeContract({
        address: deployment.factory,
        abi: factoryAbi,
        functionName: "createCampaign",
        args: [campaignId, creator, commissionBps, ruleVersion, campaignEnd],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const [created] = parseEventLogs({
        abi: factoryAbi,
        eventName: "CampaignCreated",
        logs: receipt.logs,
      });
      const address = created?.args.settlement;
      if (!address) throw new Error("Campaign address missing from receipt.");
      setCampaign(address);
      window.localStorage.setItem("jorqeth.campaign", address);
      setNotice("Campaign created. Its rule and payout wallet are now fixed on-chain.");
    } catch (cause) {
      setError(messageFrom(cause, "The campaign could not be created. Check your wallet and try again."));
    } finally {
      setBusy(undefined);
    }
  }

  async function fundCampaign() {
    clearMessages();
    if (!deployment.token || !campaign || !account) {
      setError("Connect a wallet and create a campaign before funding escrow.");
      return;
    }
    let amount: bigint;
    try {
      amount = parseUnits(escrowAmount, 6);
      if (amount <= BigInt(0)) throw new Error("zero amount");
    } catch {
      setError("Enter an escrow amount greater than zero.");
      return;
    }

    setBusy("fund");
    try {
      const wallet = walletClient();
      setNotice("Approve the faucet transaction in your wallet.");
      const mintHash = await wallet.writeContract({
        address: deployment.token,
        abi: tokenAbi,
        functionName: "mint",
        args: [account, amount],
      });
      await publicClient.waitForTransactionReceipt({ hash: mintHash });

      setNotice("Approve the escrow allowance in your wallet.");
      const approveHash = await wallet.writeContract({
        address: deployment.token,
        abi: tokenAbi,
        functionName: "approve",
        args: [campaign, amount],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      setNotice("Confirm the escrow funding transaction.");
      const fundHash = await wallet.writeContract({
        address: campaign,
        abi: settlementAbi,
        functionName: "fund",
        args: [amount],
      });
      await publicClient.waitForTransactionReceipt({ hash: fundHash });
      await refreshCampaign(campaign);
      setNotice("Escrow funded on Coston2. The funds are locked to this campaign.");
    } catch (cause) {
      setError(messageFrom(cause, "Escrow funding did not finish. Completed transactions remain on-chain."));
    } finally {
      setBusy(undefined);
    }
  }

  async function evaluateRecord() {
    clearMessages();
    if (!campaign) {
      setError("Create and fund a campaign before evaluating a record.");
      return;
    }
    if (!recordReference.trim()) {
      setError("Enter the agreed private record reference.");
      return;
    }
    setBusy("evaluate");
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settlement: campaign, reference: recordReference.trim() }),
      });
      const payload = (await response.json()) as Evaluation & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Evaluation failed.");
      setEvaluation(payload);
      setVerified(false);
      setSettlementHash(undefined);
      setNotice(
        payload.outcome === "eligible"
          ? "Evaluation complete. Only the signed payout result left the private step."
          : "Evaluation complete. This record pays zero and exposes no sales details.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The private evaluation could not finish.");
    } finally {
      setBusy(undefined);
    }
  }

  async function settleCommission() {
    clearMessages();
    if (!campaign || !evaluation) {
      setError("Run the private evaluation before settlement.");
      return;
    }
    setBusy("settle");
    try {
      const hash = await walletClient().writeContract({
        address: campaign,
        abi: settlementAbi,
        functionName: "settle",
        args: [toPayableResult(evaluation), evaluation.signature],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setSettlementHash(hash);
      await verifySettlement(campaign, evaluation.result.orderDigest);
      setNotice("Settlement confirmed on Coston2. The order digest is now closed against replay.");
    } catch (cause) {
      setError(messageFrom(cause, "Settlement failed. The escrow was not changed by a reverted transaction."));
    } finally {
      setBusy(undefined);
    }
  }

  async function verifySettlement(address: Address, orderDigest: Hex) {
    const [once, escrow, total] = await Promise.all([
      publicClient.readContract({ address, abi: settlementAbi, functionName: "settled", args: [orderDigest] }),
      publicClient.readContract({ address, abi: settlementAbi, functionName: "escrowBalance" }),
      publicClient.readContract({ address, abi: settlementAbi, functionName: "totalSettled" }),
    ]);
    setVerified(once);
    setEscrowBalance(escrow);
    setTotalSettled(total);
  }

  async function refreshCampaign(address: Address) {
    try {
      const [escrow, total] = await Promise.all([
        publicClient.readContract({ address, abi: settlementAbi, functionName: "escrowBalance" }),
        publicClient.readContract({ address, abi: settlementAbi, functionName: "totalSettled" }),
      ]);
      setEscrowBalance(escrow);
      setTotalSettled(total);
    } catch {
      window.localStorage.removeItem("jorqeth.campaign");
      setCampaign(undefined);
    }
  }

  const steps = [
    Boolean(account && chainId === coston2.id),
    Boolean(creator && isAddress(creator)),
    Boolean(campaign),
    escrowBalance > BigInt(0),
    Boolean(recordReference.trim()),
    Boolean(evaluation),
    Boolean(settlementHash),
    verified,
  ];

  return (
    <div className="journey">
      <section className="journey__intro">
        <div>
          <span className="eyebrow">Live settlement</span>
          <h1>Settle a private commission on Coston2.</h1>
          <p>
            Create a campaign, lock testnet escrow, evaluate an agreed private record,
            and pay the exact commission once. Customer and sales details never enter the browser or chain.
          </p>
        </div>
        <div className={`network-card${deploymentConfigured ? " network-card--ready" : ""}`}>
          <span className="dot" />
          <div>
            <b>{deploymentConfigured ? "Coston2 contracts configured" : "Deployment configuration needed"}</b>
            <span>Chain 114 · test tokens only</span>
          </div>
        </div>
      </section>

      {!deploymentConfigured && (
        <div className="journey-alert journey-alert--warning" role="status">
          The app code is ready, but the public factory, token, and verifier addresses have not been added.
          Deploy the contracts and set the three public environment variables before using the flow.
        </div>
      )}
      {error && <div className="journey-alert journey-alert--error" role="alert">{error}</div>}
      {notice && <div className="journey-alert journey-alert--success" role="status">{notice}</div>}

      <ol className="journey__steps">
        <li className={steps[0] ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">1</div>
          <div className="journey-step__content">
            <h2>Connect your wallet</h2>
            <p>Use an injected EVM wallet. Jorqeth will add or switch to Flare Testnet Coston2.</p>
            {account ? (
              <div className="journey-value"><span>Connected</span><code>{short(account)}</code></div>
            ) : (
              <button className="btn btn--primary" onClick={connectWallet} disabled={busy === "connect"}>
                {busy === "connect" ? "Connecting…" : "Connect wallet"}
              </button>
            )}
          </div>
        </li>

        <li className={steps[1] ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">2</div>
          <div className="journey-step__content">
            <h2>Choose the payout wallet</h2>
            <p>This address becomes the only recipient the campaign can pay.</p>
            <label className="field">
              <span>Creator or affiliate wallet</span>
              <input value={creator} onChange={(event) => setCreator(event.target.value)} disabled={Boolean(campaign)} />
            </label>
          </div>
        </li>

        <li className={steps[2] ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">3</div>
          <div className="journey-step__content">
            <h2>Set the commission rule</h2>
            <p>The percentage is fixed in the campaign contract before escrow is funded.</p>
            <label className="field field--short">
              <span>Commission percentage</span>
              <div className="field__unit"><input inputMode="decimal" value={commissionPercent} onChange={(event) => setCommissionPercent(event.target.value)} disabled={Boolean(campaign)} /><span>%</span></div>
            </label>
            {campaign ? (
              <div className="journey-value">
                <span>Campaign contract</span>
                <a href={`${EXPLORER}/address/${campaign}`} target="_blank" rel="noopener noreferrer">{short(campaign)}</a>
              </div>
            ) : (
              <button className="btn btn--primary" onClick={createCampaign} disabled={!account || !deploymentConfigured || Boolean(busy)}>
                {busy === "create" ? "Creating campaign…" : "Create campaign on Coston2"}
              </button>
            )}
          </div>
        </li>

        <li className={steps[3] ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">4</div>
          <div className="journey-step__content">
            <h2>Fund the escrow</h2>
            <p>Mint faucet-only mUSD, approve the campaign, and lock the payout budget. Three wallet confirmations are required.</p>
            <label className="field field--short">
              <span>Escrow amount</span>
              <div className="field__unit"><input inputMode="decimal" value={escrowAmount} onChange={(event) => setEscrowAmount(event.target.value)} /><span>mUSD</span></div>
            </label>
            <button className="btn btn--primary" onClick={fundCampaign} disabled={!campaign || Boolean(busy)}>
              {busy === "fund" ? "Funding escrow…" : "Get test tokens and fund escrow"}
            </button>
            {campaign && <div className="journey-value"><span>Escrow locked</span><b>{formatUnits(escrowBalance, 6)} mUSD</b></div>}
          </div>
        </li>

        <li className={steps[4] ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">5</div>
          <div className="journey-step__content">
            <h2>Reference the agreed private record</h2>
            <p>Enter the reference shared with the merchant. The browser sends the reference, never the underlying sales record.</p>
            <label className="field">
              <span>Private record reference</span>
              <input value={recordReference} onChange={(event) => { setRecordReference(event.target.value); setEvaluation(undefined); }} autoComplete="off" />
            </label>
          </div>
        </li>

        <li className={steps[5] ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">6</div>
          <div className="journey-step__content">
            <h2>Run the private evaluation</h2>
            <p>The server-side evaluator reads the private record, applies the fixed rule, and returns only a signed outcome.</p>
            <button className="btn btn--primary" onClick={evaluateRecord} disabled={!campaign || !recordReference.trim() || Boolean(busy)}>
              {busy === "evaluate" ? "Evaluating privately…" : "Calculate exact commission"}
            </button>
            {evaluation && (
              <div className="calculation">
                <span>{evaluation.outcome === "eligible" ? "Exact commission" : "Outcome"}</span>
                <b>{evaluation.outcome === "eligible" ? `${formatUnits(BigInt(evaluation.result.amount), 6)} mUSD` : "Pays zero"}</b>
                <small>{evaluation.commissionBps / 100}% floor rule · signed for this campaign only</small>
              </div>
            )}
          </div>
        </li>

        <li className={steps[6] ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">7</div>
          <div className="journey-step__content">
            <h2>Settle on-chain</h2>
            <p>The contract verifies the signer, campaign, creator, amount, expiry, and replay guard before value moves.</p>
            <button className="btn btn--primary" onClick={settleCommission} disabled={!evaluation || Boolean(busy)}>
              {busy === "settle" ? "Waiting for confirmation…" : "Settle exact commission"}
            </button>
            {settlementHash && <a className="journey-link" href={`${EXPLORER}/tx/${settlementHash}`} target="_blank" rel="noopener noreferrer">View settlement transaction <span>↗</span></a>}
          </div>
        </li>

        <li className={steps[7] ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">8</div>
          <div className="journey-step__content">
            <h2>Verify it paid once</h2>
            <p>The order digest closes permanently after settlement. A second payout attempt reverts.</p>
            {verified ? (
              <div className="proof-result">
                <span className="proof-result__check">✓</span>
                <div><b>Paid once and closed</b><span>Total settled: {formatUnits(totalSettled, 6)} mUSD · escrow remaining: {formatUnits(escrowBalance, 6)} mUSD</span></div>
              </div>
            ) : (
              <span className="journey-muted">Settlement proof appears here after confirmation.</span>
            )}
          </div>
        </li>
      </ol>

      <section className="journey__reference">
        <div>
          <h2>Inspect the reference proof</h2>
          <p>The existing receipt and failure matrix remain available as reproducible evidence for the settlement invariant.</p>
        </div>
        <div className="hero__actions">
          <Link className="btn btn--tinted" href="/app/receipt">Reference receipt</Link>
          <Link className="btn btn--tinted" href="/app/activity">Failure matrix</Link>
        </div>
      </section>
    </div>
  );
}
