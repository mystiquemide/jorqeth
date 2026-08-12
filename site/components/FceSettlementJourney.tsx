"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  createWalletClient,
  custom,
  decodeAbiParameters,
  encodeAbiParameters,
  encodePacked,
  formatUnits,
  isAddress,
  keccak256,
  parseEventLogs,
  parseUnits,
  toBytes,
  toHex,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import {
  coston2,
  deployment,
  erc20Abi,
  factoryAbi,
  fceDeploymentConfigured,
  fceInstructionSenderAbi,
  FLARE_COSTON2_FAUCET_URL,
  fxrpDeploymentConfigured,
  mockTokenAbi,
  payableResultTypes,
  publicClient,
  settlementAbi,
  type PayableResult,
} from "@/lib/jorqeth";

type WalletProvider = EIP1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type FceActionResponse = {
  result: {
    id: Hex;
    submissionTag: string;
    status: number;
    log: string;
    data: Hex;
  };
  signature: Hex;
  proxySignature?: Hex;
};

type FceEvaluation = {
  result: PayableResult;
  proof: Hex;
  instructionId: Hex;
  instructionTx: Hex;
};

const EXPLORER = coston2.blockExplorers.default.url;
const INSTRUCTION_FEE = BigInt(1_000_000);
const DEFAULT_REFERENCE = "private-order-1";
const ASSET_DECIMALS = 6;

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function messageFrom(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";

  if (message) console.error("Jorqeth flow error:", error);

  if (/rejected|denied|cancelled/i.test(message)) {
    return "The wallet request was cancelled. You can try again when ready.";
  }
  if (/insufficient funds/i.test(message)) {
    return "You need a small amount of C2FLR for Flare network fees. Add testnet funds, then try again.";
  }
  if (/too close to expiry/i.test(message)) {
    return "This campaign is about to end. Start a new campaign to continue.";
  }
  if (/proxy|result polling|still pending|temporarily unavailable|could not be reached|tee result/i.test(message)) {
    return "Private verification is temporarily unavailable. No payout was made. Try again shortly.";
  }
  if (/different settlement|verification|invalid signature|active tee|revert|reverted|result is bound/i.test(message)) {
    return "We couldn’t verify this result, so no payout was made.";
  }

  return fallback;
}

export default function FceSettlementJourney() {
  const usingFxrp = Boolean(deployment.fxrpFactory);
  const primaryToken = usingFxrp ? deployment.fxrpToken : deployment.token;
  const primaryFactory = usingFxrp ? deployment.fxrpFactory : deployment.fceFactory;
  const primaryDeploymentConfigured = usingFxrp
    ? fxrpDeploymentConfigured
    : fceDeploymentConfigured;
  const assetSymbol = usingFxrp ? "test FXRP" : "mUSD";
  const assetShort = usingFxrp ? "FXRP" : "mUSD";
  const storageKey = usingFxrp
    ? "jorqeth.fceCampaign.fxrp"
    : "jorqeth.fceCampaign.musd";

  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [creator, setCreator] = useState("");
  // The current private demo record is 100 units. With FXRP, 1% produces a clean
  // 1 FXRP payout while a 5 FXRP campaign comfortably covers the commission.
  const [commissionPercent, setCommissionPercent] = useState(usingFxrp ? "1" : "20");
  const [escrowAmount, setEscrowAmount] = useState(usingFxrp ? "5" : "100");
  const [campaign, setCampaign] = useState<Address>();
  const [recordReference, setRecordReference] = useState(DEFAULT_REFERENCE);
  const [evaluation, setEvaluation] = useState<FceEvaluation>();
  const [settlementHash, setSettlementHash] = useState<Hex>();
  const [escrowBalance, setEscrowBalance] = useState(BigInt(0));
  const [totalSettled, setTotalSettled] = useState(BigInt(0));
  const [walletAssetBalance, setWalletAssetBalance] = useState(BigInt(0));
  const [verified, setVerified] = useState(false);
  const [proxyReady, setProxyReady] = useState<boolean>();
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  const provider = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return (window as typeof window & { ethereum?: WalletProvider }).ethereum;
  }, []);

  useEffect(() => {
    void fetch("/api/fce-result?health=1", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { configured?: boolean }) => setProxyReady(Boolean(payload.configured)))
      .catch(() => setProxyReady(false));
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    const legacySaved = !usingFxrp
      ? window.localStorage.getItem("jorqeth.fceCampaign")
      : null;
    const candidate = saved || legacySaved;
    if (candidate && isAddress(candidate)) setCampaign(candidate);
  }, [storageKey, usingFxrp]);

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
    if (campaign) void refreshCampaign(campaign);
  }, [campaign]);

  useEffect(() => {
    if (account) void refreshWalletAssetBalance(account);
  }, [account, primaryToken]);

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
      setError("No wallet was found. Install or open an EVM wallet such as MetaMask, then try again.");
      return;
    }
    setBusy("connect");
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
      if (!accounts[0]) throw new Error("No wallet account returned.");
      const current = Number.parseInt((await provider.request({ method: "eth_chainId" })) as string, 16);
      if (current !== coston2.id) {
        try {
          await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x72" }] });
        } catch {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x72",
              chainName: coston2.name,
              nativeCurrency: coston2.nativeCurrency,
              rpcUrls: coston2.rpcUrls.default.http,
              blockExplorerUrls: [EXPLORER],
            }],
          });
        }
      }
      setAccount(accounts[0]);
      setCreator((currentCreator) => currentCreator || accounts[0]);
      setChainId(coston2.id);
      await refreshWalletAssetBalance(accounts[0]);
      setNotice("Wallet connected to Flare Coston2.");
    } catch (cause) {
      setError(messageFrom(cause, "We couldn’t connect your wallet. Check the wallet and try again."));
    } finally {
      setBusy(undefined);
    }
  }

  async function createCampaign() {
    clearMessages();
    if (!primaryFactory || !account) {
      setError("Campaign creation is temporarily unavailable. Try again shortly.");
      return;
    }
    if (!isAddress(creator)) {
      setError("Enter a valid wallet address for the person receiving the commission.");
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
        encodePacked(["address", "uint256"], [account, BigInt(Date.now())]),
      );
      const ruleVersion = keccak256(toBytes(`jorqeth.floor.v1:${commissionBps}`));
      const campaignEnd = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);
      const hash = await walletClient().writeContract({
        address: primaryFactory,
        abi: factoryAbi,
        functionName: "createCampaign",
        args: [campaignId, creator, commissionBps, ruleVersion, campaignEnd],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const [created] = parseEventLogs({ abi: factoryAbi, eventName: "CampaignCreated", logs: receipt.logs });
      const address = created?.args.settlement;
      if (!address) throw new Error("FCE campaign address missing from receipt.");
      setCampaign(address);
      window.localStorage.setItem(storageKey, address);
      setNotice(`Campaign created on Flare with ${assetSymbol} settlement. You can fund it now.`);
    } catch (cause) {
      setError(messageFrom(cause, "We couldn’t create the campaign. No funds were moved. Try again."));
    } finally {
      setBusy(undefined);
    }
  }

  async function fundCampaign() {
    clearMessages();
    if (!primaryToken || !campaign || !account) {
      setError("Connect your wallet and create a campaign first.");
      return;
    }
    let amount: bigint;
    try {
      amount = parseUnits(escrowAmount, ASSET_DECIMALS);
      if (amount <= BigInt(0)) throw new Error("zero amount");
    } catch {
      setError("Enter an amount greater than zero.");
      return;
    }

    setBusy("fund");
    try {
      const wallet = walletClient();

      if (usingFxrp) {
        const balance = await publicClient.readContract({
          address: primaryToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account],
        });
        setWalletAssetBalance(balance);
        if (balance < amount) {
          setError(
            `You need ${formatUnits(amount, ASSET_DECIMALS)} test FXRP to fund this campaign. Get test FXRP from the Flare faucet, then try again.`,
          );
          return;
        }
      } else {
        const mintHash = await wallet.writeContract({
          address: primaryToken,
          abi: mockTokenAbi,
          functionName: "mint",
          args: [account, amount],
        });
        await publicClient.waitForTransactionReceipt({ hash: mintHash });
      }

      const approveHash = await wallet.writeContract({
        address: primaryToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [campaign, amount],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      const fundHash = await wallet.writeContract({
        address: campaign,
        abi: settlementAbi,
        functionName: "fund",
        args: [amount],
      });
      await publicClient.waitForTransactionReceipt({ hash: fundHash });
      await Promise.all([refreshCampaign(campaign), refreshWalletAssetBalance(account)]);
      setNotice(`Campaign funded with ${assetSymbol}. The payout budget is ready.`);
    } catch (cause) {
      setError(messageFrom(cause, "We couldn’t finish funding the campaign. Check your wallet and try again."));
    } finally {
      setBusy(undefined);
    }
  }

  async function runFceEvaluation() {
    clearMessages();
    if (!primaryDeploymentConfigured || !proxyReady) {
      setError("Private verification is temporarily unavailable. Your funds are unchanged. Try again shortly.");
      return;
    }
    if (!campaign || !deployment.fceInstructionSender) {
      setError("Create and fund a campaign first.");
      return;
    }
    if (!recordReference.trim()) {
      setError("Enter the order reference agreed with the merchant.");
      return;
    }

    setBusy("fce");
    try {
      const [campaignId, creatorAddress, commissionBps, ruleVersion, campaignEnd] = await Promise.all([
        publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "campaignId" }),
        publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "creator" }),
        publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "commissionBps" }),
        publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "ruleVersion" }),
        publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "campaignEnd" }),
      ]);
      const issuedAt = (await publicClient.getBlock({ blockTag: "latest" })).timestamp;
      const expiry = issuedAt + BigInt(900) < campaignEnd ? issuedAt + BigInt(900) : campaignEnd;
      if (expiry <= issuedAt + BigInt(60)) throw new Error("Campaign is too close to expiry for an FCE request.");

      const reference = recordReference.trim();
      const orderDigest = keccak256(toBytes(reference));
      const nonce = keccak256(
        encodePacked(["bytes32", "address", "uint256"], [orderDigest, campaign, BigInt(Date.now())]),
      );
      const request = {
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
      };

      setNotice("Private verification started on Flare. This can take a few moments.");
      const instructionTx = await walletClient().writeContract({
        address: deployment.fceInstructionSender,
        abi: fceInstructionSenderAbi,
        functionName: "sendEvaluation",
        args: [toHex(JSON.stringify(request))],
        value: INSTRUCTION_FEE,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: instructionTx });
      const sent = parseEventLogs({
        abi: fceInstructionSenderAbi,
        eventName: "EvaluationInstructionSent",
        logs: receipt.logs,
      })[0];
      const instructionId = sent?.args.instructionId;
      if (!instructionId) throw new Error("Instruction ID missing from FCE transaction receipt.");

      setNotice("Your private check is running. Waiting for the verified result.");
      const action = await pollFceResult(instructionId);
      if (action.result.status !== 1) {
        throw new Error(action.result.log || "The FCE extension rejected the evaluation.");
      }

      const decoded = decodeAbiParameters(payableResultTypes.PayableResult, action.result.data);
      const result: PayableResult = {
        schemaVersion: Number(decoded[0]),
        campaignId: decoded[1],
        orderDigest: decoded[2],
        creator: decoded[3],
        amount: decoded[4],
        eligibilityCode: Number(decoded[5]),
        chainId: decoded[6],
        settlementContract: decoded[7],
        ruleVersion: decoded[8],
        nonce: decoded[9],
        issuedAt: decoded[10],
        expiry: decoded[11],
      };
      if (result.settlementContract.toLowerCase() !== campaign.toLowerCase()) {
        throw new Error("FCE result is bound to a different settlement contract.");
      }
      const proof = encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "bytes" },
          { type: "uint8" },
          { type: "bytes" },
        ],
        [instructionId, toHex(action.result.submissionTag), action.result.status, action.signature],
      );

      setEvaluation({ result, proof, instructionId, instructionTx });
      setNotice("Private verification complete. Review the amount, then settle on Flare.");
    } catch (cause) {
      setError(messageFrom(cause, "We couldn’t complete the private verification. No payout was made. Try again."));
    } finally {
      setBusy(undefined);
    }
  }

  async function pollFceResult(instructionId: Hex): Promise<FceActionResponse> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await fetch(`/api/fce-result?instructionId=${instructionId}`, { cache: "no-store" });
      if (response.status === 202) {
        await delay(2_000);
        continue;
      }
      const payload = (await response.json()) as FceActionResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Private verification result polling failed.");
      return payload;
    }
    throw new Error("The private verification result is still pending. Try again shortly.");
  }

  async function settleCommission() {
    clearMessages();
    if (!campaign || !evaluation) {
      setError("Run the private verification first.");
      return;
    }
    setBusy("settle");
    try {
      const hash = await walletClient().writeContract({
        address: campaign,
        abi: settlementAbi,
        functionName: "settle",
        args: [evaluation.result, evaluation.proof],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setSettlementHash(hash);
      await verifySettlement(campaign, evaluation.result.orderDigest);
      if (account) await refreshWalletAssetBalance(account);
      setNotice(`Settlement confirmed on Flare Coston2 in ${assetShort}.`);
    } catch (cause) {
      setError(messageFrom(cause, "We couldn’t complete the payout. No unverified payout was made."));
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
    } catch (cause) {
      console.error("Could not refresh saved campaign:", cause);
      window.localStorage.removeItem(storageKey);
      setCampaign(undefined);
    }
  }

  async function refreshWalletAssetBalance(address: Address) {
    if (!primaryToken) return;
    try {
      const balance = await publicClient.readContract({
        address: primaryToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });
      setWalletAssetBalance(balance);
    } catch (cause) {
      console.error("Could not refresh wallet asset balance:", cause);
    }
  }

  function resetCampaign() {
    window.localStorage.removeItem(storageKey);
    setCampaign(undefined);
    setEvaluation(undefined);
    setSettlementHash(undefined);
    setEscrowBalance(BigInt(0));
    setTotalSettled(BigInt(0));
    setVerified(false);
    setCreator(account || "");
    clearMessages();
  }

  const ready = primaryDeploymentConfigured && proxyReady === true;
  const readinessLabel =
    proxyReady === undefined
      ? "Checking private verification…"
      : ready
        ? "Private verification ready"
        : "Private verification unavailable";

  return (
    <div className="journey">
      <section className="journey__intro">
        <div>
          <span className="eyebrow">Built on Flare</span>
          <h1>
            {usingFxrp
              ? "Settle a private FXRP commission on Flare."
              : "Settle a private commission on Flare."}
          </h1>
          <p>
            {usingFxrp
              ? "Fund the campaign with test FXRP, privately check the agreed merchant record with Flare Confidential Compute, then settle the exact FXRP commission on Coston2."
              : "Create a campaign, fund it, run the private check with Flare Confidential Compute, then settle the exact verified commission on Coston2."}
          </p>
        </div>
        <div className={`network-card${ready ? " network-card--ready" : ""}`}>
          <span className="dot" />
          <div>
            <b>{readinessLabel}</b>
            <span>
              {usingFxrp
                ? "FXRP · Flare Confidential Compute · Coston2"
                : "Powered by Flare Confidential Compute · Coston2"}
            </span>
          </div>
        </div>
      </section>

      {(proxyReady === false || !primaryDeploymentConfigured) && (
        <div className="journey-alert journey-alert--warning" role="status">
          Private verification is temporarily unavailable. You can still explore the live Flare proof,
          but new private checks are paused. No payout will be made until verification is available.
        </div>
      )}
      {error && <div className="journey-alert journey-alert--error" role="alert">{error}</div>}
      {notice && <div className="journey-alert journey-alert--success" role="status">{notice}</div>}

      <ol className="journey__steps">
        <li className={account ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">1</div>
          <div className="journey-step__content">
            <h2>Connect your wallet</h2>
            <p>Connect an EVM wallet. Jorqeth will switch it to Flare Testnet Coston2.</p>
            <button className="btn btn--primary" onClick={connectWallet} disabled={busy === "connect"}>
              {account ? `${account.slice(0, 8)}…${account.slice(-6)}` : busy === "connect" ? "Connecting…" : "Connect wallet"}
            </button>
            {account && usingFxrp && (
              <span className="journey-muted">
                Wallet balance: {formatUnits(walletAssetBalance, ASSET_DECIMALS)} test FXRP
              </span>
            )}
          </div>
        </li>

        <li className={campaign ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">2</div>
          <div className="journey-step__content">
            <h2>Create the commission campaign</h2>
            <p>
              {usingFxrp
                ? "Choose who gets paid and set the commission rate. Jorqeth creates an FXRP settlement campaign on Flare."
                : "Choose who gets paid and set the commission rate. Jorqeth creates the campaign on Flare."}
            </p>
            <label className="field"><span>Creator payout wallet</span><input value={creator} onChange={(event) => setCreator(event.target.value)} /></label>
            <label className="field field--short"><span>Commission percentage</span><div className="field__unit"><input inputMode="decimal" value={commissionPercent} onChange={(event) => setCommissionPercent(event.target.value)} /><span>%</span></div></label>
            <button className="btn btn--primary" onClick={createCampaign} disabled={!account || chainId !== coston2.id || Boolean(campaign) || busy === "create"}>
              {busy === "create" ? "Creating…" : campaign ? "Campaign created" : "Create campaign"}
            </button>
            {campaign && <a className="journey-link" href={`${EXPLORER}/address/${campaign}`} target="_blank" rel="noreferrer">View campaign on Flare</a>}
          </div>
        </li>

        <li className={escrowBalance > BigInt(0) ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">3</div>
          <div className="journey-step__content">
            <h2>Fund the campaign</h2>
            <p>
              {usingFxrp
                ? "Add test FXRP to the campaign so the verified XRP-denominated commission can be paid."
                : "Add test mUSD to the campaign so the verified commission can be paid."}
            </p>
            <label className="field field--short"><span>Escrow amount</span><div className="field__unit"><input inputMode="decimal" value={escrowAmount} onChange={(event) => setEscrowAmount(event.target.value)} /><span>{assetShort}</span></div></label>
            <button className="btn btn--primary" onClick={fundCampaign} disabled={!campaign || busy === "fund"}>
              {busy === "fund" ? "Funding…" : `Fund with ${assetShort}`}
            </button>
            {usingFxrp && (
              <a className="journey-link" href={FLARE_COSTON2_FAUCET_URL} target="_blank" rel="noreferrer">
                Get test FXRP from the official Flare faucet
              </a>
            )}
            {campaign && <span className="journey-muted">Available for payouts: {formatUnits(escrowBalance, ASSET_DECIMALS)} {assetSymbol}</span>}
          </div>
        </li>

        <li className={evaluation ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">4</div>
          <div className="journey-step__content">
            <h2>Run the private verification</h2>
            <p>
              The merchant record stays private. Jorqeth uses Flare Confidential Compute to check
              the agreed reference and return only the payout result.
            </p>
            <label className="field"><span>Order reference</span><input autoComplete="off" value={recordReference} onChange={(event) => setRecordReference(event.target.value)} /><small>Demo reference: {DEFAULT_REFERENCE}</small></label>
            <button className="btn btn--primary" onClick={runFceEvaluation} disabled={!ready || !campaign || escrowBalance === BigInt(0) || busy === "fce"}>
              {busy === "fce" ? "Running private check…" : "Run private check"}
            </button>
            {evaluation && (
              <a className="journey-link" href={`${EXPLORER}/tx/${evaluation.instructionTx}`} target="_blank" rel="noreferrer">
                View verification transaction on Flare
              </a>
            )}
          </div>
        </li>

        <li className={settlementHash ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">5</div>
          <div className="journey-step__content">
            <h2>Review and settle</h2>
            <p>Jorqeth verifies the signed result before any payout can move.</p>
            {evaluation && <span className="journey-muted">Verified amount: {formatUnits(evaluation.result.amount, ASSET_DECIMALS)} {assetSymbol} · {evaluation.result.eligibilityCode === 1 ? "Eligible for payout" : "No payout due"}</span>}
            <button className="btn btn--primary" onClick={settleCommission} disabled={!evaluation || Boolean(settlementHash) || busy === "settle"}>
              {busy === "settle" ? "Settling…" : settlementHash ? "Settled" : `Settle ${assetShort} on Flare`}
            </button>
            {settlementHash && <a className="journey-link" href={`${EXPLORER}/tx/${settlementHash}`} target="_blank" rel="noreferrer">View settlement on Flare</a>}
          </div>
        </li>

        <li className={verified ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">6</div>
          <div className="journey-step__content">
            <h2>Payment confirmed</h2>
            <p>Once settled, the same private order cannot pay twice.</p>
            <span className="journey-muted">Paid: {formatUnits(totalSettled, ASSET_DECIMALS)} {assetSymbol} · Remaining campaign funds: {formatUnits(escrowBalance, ASSET_DECIMALS)} {assetSymbol}</span>
            {verified && <b>Verified on Flare Coston2.</b>}
          </div>
        </li>
      </ol>

      <section className="journey__reference">
        <div>
          <h2>Want a quicker fallback demo?</h2>
          <p>
            {usingFxrp
              ? "The main flow above uses test FXRP and Flare Confidential Compute. The simplified fallback remains separate and uses the original disclosed-signer test flow."
              : "A simplified test flow is available separately. The main flow above uses Flare Confidential Compute."}
          </p>
        </div>
        <div className="hero__actions">
          <Link className="btn btn--tinted" href="/app/demo">Open fallback demo</Link>
          {campaign && <button className="btn btn--tinted" onClick={resetCampaign}>Start a new campaign</button>}
        </div>
      </section>
    </div>
  );
}
