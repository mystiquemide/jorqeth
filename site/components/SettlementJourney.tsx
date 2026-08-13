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
  stringToHex,
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
  activeTeeRegistryAbi,
  fceInstructionSenderAbi,
  fceVerifierAbi,
  publicClient,
  settlementAbi,
  tokenAbi,
  type PayableResult,
} from "@/lib/jorqeth";

type Evaluation = {
  instructionId: Hex;
  submissionTag: string;
  status: number;
  version: string;
  proof: Hex;
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

type FceResultPayload = {
  instructionId: Hex;
  submissionTag: string;
  status: number;
  version: string;
  signature: Hex;
  proof: Hex;
  result: Evaluation["result"];
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

function privateMessageFrom(error: unknown) {
  if (error instanceof Error) {
    if (/rejected|denied|cancelled/i.test(error.message)) {
      return "The wallet request was cancelled. You can try again when ready.";
    }
    if (/insufficient funds/i.test(error.message)) {
      return "This wallet needs C2FLR for network fees. Add faucet funds, then try again.";
    }
    if (/taking longer|temporarily unavailable|couldn't verify|couldn’t verify|too close/i.test(error.message)) {
      return error.message;
    }
  }
  return "Private verification is temporarily unavailable. No payout was made.";
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
  const [commissionPercent, setCommissionPercent] = useState("20");
  const [escrowAmount, setEscrowAmount] = useState("100");
  const [campaign, setCampaign] = useState<Address>();
  const [recordReference, setRecordReference] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation>();
  const [fceReady, setFceReady] = useState<boolean>();
  const [campaignCreationHash, setCampaignCreationHash] = useState<Hex>();
  const [fundingHash, setFundingHash] = useState<Hex>();
  const [instructionHash, setInstructionHash] = useState<Hex>();
  const [instructionId, setInstructionId] = useState<Hex>();
  const [teeSigner, setTeeSigner] = useState<Address>();
  const [settlementHash, setSettlementHash] = useState<Hex>();
  const [verified, setVerified] = useState(false);
  const [replayRejected, setReplayRejected] = useState<boolean>();
  const [escrowBalance, setEscrowBalance] = useState<bigint>(BigInt(0));
  const [totalSettled, setTotalSettled] = useState<bigint>(BigInt(0));
  const [creatorBalanceBefore, setCreatorBalanceBefore] = useState<bigint>();
  const [creatorBalanceAfter, setCreatorBalanceAfter] = useState<bigint>();
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
    let active = true;
    void fetch("/api/fce-result?health=1", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { configured?: boolean; ready?: boolean };
        if (active) setFceReady(Boolean(payload.configured && payload.ready));
      })
      .catch(() => {
        if (active) setFceReady(false);
      });
    return () => {
      active = false;
    };
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
    if (!deployment.fceFactory || !deployment.fceVerifier || !deployment.fceInstructionSender) {
      setError("Private verification is still coming online. Try again shortly.");
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
        address: deployment.fceFactory,
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
      setCampaignCreationHash(hash);
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
      setFundingHash(fundHash);
      await refreshCampaign(campaign);
      setNotice("Escrow funded on Coston2. The funds are locked to this campaign.");
    } catch (cause) {
      setError(messageFrom(cause, "Escrow funding did not finish. Completed transactions remain on-chain."));
    } finally {
      setBusy(undefined);
    }
  }

  async function pollFceResult(id: Hex): Promise<FceResultPayload> {
    for (let attempt = 0; attempt < 36; attempt += 1) {
      const response = await fetch(`/api/fce-result?instructionId=${id}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        pending?: boolean;
        error?: string;
        instructionId?: Hex;
        submissionTag?: string;
        status?: number;
        version?: string;
        signature?: Hex;
        proof?: Hex;
        result?: Evaluation["result"];
      };
      if (response.status === 202 || payload.pending) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        continue;
      }
      if (!response.ok || !payload.result || !payload.signature || !payload.proof) {
        throw new Error(payload.error || "Private verification is temporarily unavailable. No payout was made.");
      }
      return {
        instructionId: payload.instructionId || id,
        submissionTag: payload.submissionTag || "threshold",
        status: payload.status ?? 1,
        version: payload.version || "0.2.0",
        signature: payload.signature,
        proof: payload.proof,
        result: payload.result,
      };
    }
    throw new Error("Your private check is taking longer than expected. Try again.");
  }

  async function verifyFceResult(candidate: Evaluation) {
    if (!deployment.fceVerifier) throw new Error("We couldn’t verify this result, so no payout was made.");
    try {
      const result = toPayableResult(candidate);
      const valid = await publicClient.readContract({
        address: deployment.fceVerifier,
        abi: fceVerifierAbi,
        functionName: "verify",
        args: [result, candidate.proof],
      });
      if (!valid) throw new Error("invalid result");

      const [registry, extensionId] = await Promise.all([
        publicClient.readContract({
          address: deployment.fceVerifier,
          abi: fceVerifierAbi,
          functionName: "registry",
        }),
        publicClient.readContract({
          address: deployment.fceVerifier,
          abi: fceVerifierAbi,
          functionName: "extensionId",
        }),
      ]);
      const [teeIds] = await publicClient.readContract({
        address: registry,
        abi: activeTeeRegistryAbi,
        functionName: "getActiveTeeMachines",
        args: [extensionId],
      });
      if (!teeIds[0]) throw new Error("no active verifier");
      setTeeSigner(teeIds[0]);
    } catch {
      throw new Error("We couldn’t verify this result, so no payout was made.");
    }
  }

  async function evaluateRecord() {
    clearMessages();
    if (!campaign || !deployment.fceInstructionSender || !deployment.fceVerifier) {
      setError("Create and fund a campaign before evaluating a record.");
      return;
    }
    if (!recordReference.trim()) {
      setError("Enter the agreed private record reference.");
      return;
    }
    if (!fceReady) {
      setError("Private verification is temporarily unavailable. No payout was made.");
      return;
    }
    setBusy("evaluate");
    try {
      const [campaignId, creatorAddress, commissionBps, ruleVersion, campaignEnd, verifier] =
        await Promise.all([
          publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "campaignId" }),
          publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "creator" }),
          publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "commissionBps" }),
          publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "ruleVersion" }),
          publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "campaignEnd" }),
          publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "verifier" }),
        ]);
      if (verifier.toLowerCase() !== deployment.fceVerifier.toLowerCase()) {
        throw new Error("This campaign is not configured for private verification.");
      }

      const orderDigest = keccak256(toBytes(recordReference.trim()));
      const nonce = keccak256(
        encodePacked(["bytes32", "uint256"], [orderDigest, BigInt(Date.now())]),
      );
      const issuedAt = (await publicClient.getBlock({ blockTag: "latest" })).timestamp;
      const expiry = issuedAt + BigInt(3600) < campaignEnd ? issuedAt + BigInt(3600) : campaignEnd;
      if (expiry <= issuedAt + BigInt(60)) {
        throw new Error("This campaign is too close to its end time for a new private check.");
      }

      const requestMessage = JSON.stringify({
        schemaVersion: 1,
        campaignId,
        orderDigest,
        creator: creatorAddress,
        commissionBps: Number(commissionBps),
        chainId: coston2.id,
        settlementContract: campaign,
        ruleVersion,
        nonce,
        issuedAt: Number(issuedAt),
        expiry: Number(expiry),
      });

      setNotice("Confirm the private check on Coston2.");
      const instructionTx = await walletClient().writeContract({
        address: deployment.fceInstructionSender,
        abi: fceInstructionSenderAbi,
        functionName: "sendEvaluation",
        args: [stringToHex(requestMessage)],
        value: BigInt(1_000_000_000),
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: instructionTx });
      const [sent] = parseEventLogs({
        abi: fceInstructionSenderAbi,
        eventName: "EvaluationInstructionSent",
        logs: receipt.logs,
      });
      const sentId = sent?.args.instructionId as Hex | undefined;
      if (!sentId) throw new Error("The private check was not registered.");
      setInstructionHash(instructionTx);
      setInstructionId(sentId);
      setNotice("Private check sent. Waiting for the signed result.");

      const payload = await pollFceResult(sentId);
      const candidate: Evaluation = {
        instructionId: payload.instructionId,
        submissionTag: payload.submissionTag,
        status: payload.status,
        version: payload.version,
        proof: payload.proof,
        signature: payload.signature,
        result: payload.result,
        outcome: payload.result.eligibilityCode === 1 ? "eligible" : "ineligible",
        commissionBps: Number(commissionBps),
      };
      await verifyFceResult(candidate);
      const creatorBefore = await publicClient.readContract({
        address: deployment.token!,
        abi: tokenAbi,
        functionName: "balanceOf",
        args: [creatorAddress],
      });
      setCreatorBalanceBefore(creatorBefore);
      setEvaluation(candidate);
      setVerified(false);
      setReplayRejected(undefined);
      setSettlementHash(undefined);
      setNotice(
        candidate.outcome === "eligible"
          ? "Private verification complete. The signed payout is ready and no merchant record was returned."
          : "Private verification complete. This record pays zero and exposes no sales details.",
      );
    } catch (cause) {
      setEvaluation(undefined);
      setError(privateMessageFrom(cause));
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
      await verifyFceResult(evaluation);
      const hash = await walletClient().writeContract({
        address: campaign,
        abi: settlementAbi,
        functionName: "settle",
        args: [toPayableResult(evaluation), evaluation.proof],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setSettlementHash(hash);
      await verifySettlement(campaign, evaluation.result.orderDigest);
      await verifyReplayProtection(campaign, evaluation);
      setNotice("Settlement confirmed on Coston2. The exact commission is paid and the order is closed against replay.");
    } catch (cause) {
      setError(messageFrom(cause, "Settlement failed. The escrow was not changed by a reverted transaction."));
    } finally {
      setBusy(undefined);
    }
  }

  async function verifySettlement(address: Address, orderDigest: Hex) {
    const [once, escrow, total, creatorAfter] = await Promise.all([
      publicClient.readContract({ address, abi: settlementAbi, functionName: "settled", args: [orderDigest] }),
      publicClient.readContract({ address, abi: settlementAbi, functionName: "escrowBalance" }),
      publicClient.readContract({ address, abi: settlementAbi, functionName: "totalSettled" }),
      publicClient.readContract({
        address: deployment.token!,
        abi: tokenAbi,
        functionName: "balanceOf",
        args: [creator as Address],
      }),
    ]);
    setVerified(once);
    setEscrowBalance(escrow);
    setTotalSettled(total);
    setCreatorBalanceAfter(creatorAfter);
  }

  async function verifyReplayProtection(address: Address, candidate: Evaluation) {
    if (!account) return;
    try {
      await publicClient.simulateContract({
        account,
        address,
        abi: settlementAbi,
        functionName: "settle",
        args: [toPayableResult(candidate), candidate.proof],
      });
      setReplayRejected(false);
    } catch {
      setReplayRejected(true);
    }
  }

  async function refreshCampaign(address: Address) {
    try {
      if (!deployment.fceFactory) throw new Error("missing FCE factory");
      const [isFceCampaign, escrow, total] = await Promise.all([
        publicClient.readContract({
          address: deployment.fceFactory,
          abi: factoryAbi,
          functionName: "isCampaign",
          args: [address],
        }),
        publicClient.readContract({ address, abi: settlementAbi, functionName: "escrowBalance" }),
        publicClient.readContract({ address, abi: settlementAbi, functionName: "totalSettled" }),
      ]);
      if (!isFceCampaign) throw new Error("not an FCE campaign");
      setEscrowBalance(escrow);
      setTotalSettled(total);
    } catch {
      window.localStorage.removeItem("jorqeth.campaign");
      setCampaign(undefined);
    }
  }

  function resetCampaign() {
    window.localStorage.removeItem("jorqeth.campaign");
    setCampaign(undefined);
    setEvaluation(undefined);
    setCampaignCreationHash(undefined);
    setFundingHash(undefined);
    setInstructionHash(undefined);
    setInstructionId(undefined);
    setTeeSigner(undefined);
    setSettlementHash(undefined);
    setVerified(false);
    setReplayRejected(undefined);
    setEscrowBalance(BigInt(0));
    setTotalSettled(BigInt(0));
    setCreatorBalanceBefore(undefined);
    setCreatorBalanceAfter(undefined);
    setRecordReference("");
    setCreator(account || "");
    clearMessages();
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
        <div className={`network-card${deploymentConfigured && fceReady ? " network-card--ready" : ""}`}>
          <span className="dot" />
          <div>
            <b>
              {!deploymentConfigured
                ? "Deployment configuration needed"
                : fceReady
                  ? "Coston2 private verification available"
                  : "Private verification is coming online"}
            </b>
            <span>Flare Coston2 · test tokens only</span>
          </div>
        </div>
      </section>

      {!deploymentConfigured && (
        <div className="journey-alert journey-alert--warning" role="status">
          Private settlement is not configured for this deployment yet.
        </div>
      )}
      {deploymentConfigured && fceReady === false && (
        <div className="journey-alert journey-alert--warning" role="status">
          Private verification is temporarily unavailable. No payout can be made until it is ready.
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
              <>
                <div className="journey-value">
                  <span>Campaign contract</span>
                  <a href={`${EXPLORER}/address/${campaign}`} target="_blank" rel="noopener noreferrer">{short(campaign)}</a>
                </div>
                {campaignCreationHash && (
                  <a className="journey-link" href={`${EXPLORER}/tx/${campaignCreationHash}`} target="_blank" rel="noopener noreferrer">
                    View campaign transaction <span>↗</span>
                  </a>
                )}
                <button className="journey-reset" type="button" onClick={resetCampaign}>Start a new campaign</button>
              </>
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
            {fundingHash && (
              <a className="journey-link" href={`${EXPLORER}/tx/${fundingHash}`} target="_blank" rel="noopener noreferrer">
                View funding transaction <span>↗</span>
              </a>
            )}
          </div>
        </li>

        <li className={steps[4] ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">5</div>
          <div className="journey-step__content">
            <h2>Reference the agreed private record</h2>
            <p>Enter the reference shared with the merchant. Only its one-way fingerprint enters the instruction, never the underlying sales record.</p>
            <label className="field">
              <span>Private record reference</span>
              <input value={recordReference} onChange={(event) => { setRecordReference(event.target.value); setEvaluation(undefined); setInstructionHash(undefined); setInstructionId(undefined); setTeeSigner(undefined); setSettlementHash(undefined); setVerified(false); setReplayRejected(undefined); setCreatorBalanceAfter(undefined); }} autoComplete="off" />
              <small>Demo reference: private-order-1. The merchant record stays inside the private check.</small>
            </label>
          </div>
        </li>

        <li className={steps[5] ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">6</div>
          <div className="journey-step__content">
            <h2>Run the private evaluation</h2>
            <p>Flare Confidential Compute checks the agreed record inside the TEE and returns only the signed payout result.</p>
            <button className="btn btn--primary" onClick={evaluateRecord} disabled={!campaign || !recordReference.trim() || !fceReady || Boolean(busy)}>
              {busy === "evaluate" ? "Waiting for private result…" : "Run private verification"}
            </button>
            {evaluation && (
              <>
                <div className="calculation">
                  <span>{evaluation.outcome === "eligible" ? "Exact commission" : "Outcome"}</span>
                  <b>{evaluation.outcome === "eligible" ? `${formatUnits(BigInt(evaluation.result.amount), 6)} mUSD` : "Pays zero"}</b>
                  <small>{evaluation.commissionBps / 100}% floor rule · verified against the active Flare TEE</small>
                </div>
                <div className="journey-value">
                  <span>Private instruction</span>
                  <code>{short(evaluation.instructionId)}</code>
                </div>
                <div className="journey-value">
                  <span>TEE signer</span>
                  <code>{teeSigner ? short(teeSigner) : "Verified on Coston2"}</code>
                </div>
                {instructionHash && (
                  <a className="journey-link" href={`${EXPLORER}/tx/${instructionHash}`} target="_blank" rel="noopener noreferrer">
                    View private-check transaction <span>↗</span>
                  </a>
                )}
                {instructionId && <div className="journey-value"><span>Instruction ID</span><code>{instructionId}</code></div>}
              </>
            )}
          </div>
        </li>

        <li className={steps[6] ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">7</div>
          <div className="journey-step__content">
            <h2>Settle on-chain</h2>
            <p>The Coston2 contract verifies the signer, campaign, creator, amount, expiry, and replay guard before value moves.</p>
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
                <div>
                  <b>Paid once and closed</b>
                  <span>Total settled: {formatUnits(totalSettled, 6)} mUSD · escrow remaining: {formatUnits(escrowBalance, 6)} mUSD</span>
                  {creatorBalanceBefore !== undefined && creatorBalanceAfter !== undefined && (
                    <span>Creator balance change: +{formatUnits(creatorBalanceAfter - creatorBalanceBefore, 6)} mUSD</span>
                  )}
                  {replayRejected === true && <span>Second payment attempt blocked by the order guard.</span>}
                </div>
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
