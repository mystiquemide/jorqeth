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
  factoryAbi,
  fceDeploymentConfigured,
  fceInstructionSenderAbi,
  payableResultTypes,
  publicClient,
  settlementAbi,
  tokenAbi,
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

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function messageFrom(error: unknown, fallback: string) {
  if (error instanceof Error) {
    if (/rejected|denied|cancelled/i.test(error.message)) {
      return "The wallet request was cancelled. You can try again when ready.";
    }
    if (/insufficient funds/i.test(error.message)) {
      return "This wallet needs C2FLR for network fees. Add faucet funds, then try again.";
    }
    if (error.message) return error.message;
  }
  return fallback;
}

export default function FceSettlementJourney() {
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [creator, setCreator] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("20");
  const [escrowAmount, setEscrowAmount] = useState("100");
  const [campaign, setCampaign] = useState<Address>();
  const [recordReference, setRecordReference] = useState(DEFAULT_REFERENCE);
  const [evaluation, setEvaluation] = useState<FceEvaluation>();
  const [settlementHash, setSettlementHash] = useState<Hex>();
  const [escrowBalance, setEscrowBalance] = useState(BigInt(0));
  const [totalSettled, setTotalSettled] = useState(BigInt(0));
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
    const saved = window.localStorage.getItem("jorqeth.fceCampaign");
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
    if (campaign) void refreshCampaign(campaign);
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
      setError("No injected EVM wallet was found.");
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
      setNotice("Wallet connected to Coston2.");
    } catch (cause) {
      setError(messageFrom(cause, "The wallet could not connect."));
    } finally {
      setBusy(undefined);
    }
  }

  async function createCampaign() {
    clearMessages();
    if (!deployment.fceFactory || !account) {
      setError("The FCE campaign factory is not configured.");
      return;
    }
    if (!isAddress(creator)) {
      setError("Enter a valid creator payout wallet.");
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
        address: deployment.fceFactory,
        abi: factoryAbi,
        functionName: "createCampaign",
        args: [campaignId, creator, commissionBps, ruleVersion, campaignEnd],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const [created] = parseEventLogs({ abi: factoryAbi, eventName: "CampaignCreated", logs: receipt.logs });
      const address = created?.args.settlement;
      if (!address) throw new Error("FCE campaign address missing from receipt.");
      setCampaign(address);
      window.localStorage.setItem("jorqeth.fceCampaign", address);
      setNotice("FCE campaign created. Its verifier is bound to the active Flare TEE set.");
    } catch (cause) {
      setError(messageFrom(cause, "The FCE campaign could not be created."));
    } finally {
      setBusy(undefined);
    }
  }

  async function fundCampaign() {
    clearMessages();
    if (!deployment.token || !campaign || !account) {
      setError("Connect a wallet and create an FCE campaign first.");
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
      const mintHash = await wallet.writeContract({
        address: deployment.token,
        abi: tokenAbi,
        functionName: "mint",
        args: [account, amount],
      });
      await publicClient.waitForTransactionReceipt({ hash: mintHash });
      const approveHash = await wallet.writeContract({
        address: deployment.token,
        abi: tokenAbi,
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
      await refreshCampaign(campaign);
      setNotice("Escrow funded on Coston2.");
    } catch (cause) {
      setError(messageFrom(cause, "Escrow funding did not finish."));
    } finally {
      setBusy(undefined);
    }
  }

  async function runFceEvaluation() {
    clearMessages();
    if (!proxyReady) {
      setError("The public FCE result proxy is not configured for this deployment yet.");
      return;
    }
    if (!campaign || !deployment.fceInstructionSender) {
      setError("Create and fund an FCE campaign first.");
      return;
    }
    if (!recordReference.trim()) {
      setError("Enter the agreed private record reference.");
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

      setNotice("Sending the evaluation instruction through Flare FCE.");
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

      setNotice(`FCE instruction ${instructionId.slice(0, 10)}… sent. Waiting for the signed TEE result.`);
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
      setNotice("Signed FCE ActionResult received. It is ready for on-chain verification and settlement.");
    } catch (cause) {
      setError(messageFrom(cause, "The FCE evaluation did not finish."));
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
      if (!response.ok) throw new Error(payload.error || "FCE result polling failed.");
      return payload;
    }
    throw new Error("The FCE result is still pending. Try again shortly.");
  }

  async function settleCommission() {
    clearMessages();
    if (!campaign || !evaluation) {
      setError("Run the FCE evaluation first.");
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
      setNotice("FCE-verified settlement confirmed on Coston2.");
    } catch (cause) {
      setError(messageFrom(cause, "The FCE-verified settlement failed."));
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
      window.localStorage.removeItem("jorqeth.fceCampaign");
      setCampaign(undefined);
    }
  }

  function resetCampaign() {
    window.localStorage.removeItem("jorqeth.fceCampaign");
    setCampaign(undefined);
    setEvaluation(undefined);
    setSettlementHash(undefined);
    setEscrowBalance(BigInt(0));
    setTotalSettled(BigInt(0));
    setVerified(false);
    setCreator(account || "");
    clearMessages();
  }

  const ready = fceDeploymentConfigured && proxyReady === true;

  return (
    <div className="journey">
      <section className="journey__intro">
        <div>
          <span className="eyebrow">Flare Confidential Compute</span>
          <h1>Settle a commission through the live FCE path.</h1>
          <p>
            Create a Coston2 campaign, fund escrow, send the private evaluation through Flare FCE,
            receive the signed TEE ActionResult, and settle only after the active TEE verifier accepts it.
          </p>
        </div>
        <div className={`network-card${ready ? " network-card--ready" : ""}`}>
          <span className="dot" />
          <div>
            <b>{ready ? "FCE runtime ready" : "FCE runtime configuration required"}</b>
            <span>Extension {deployment.fceExtensionId} · Coston2</span>
          </div>
        </div>
      </section>

      {proxyReady === false && (
        <div className="journey-alert journey-alert--warning" role="status">
          The contracts are deployed, but this web deployment cannot yet reach the FCE result proxy.
          Set the server-only <code>JORQETH_FCE_PROXY_URL</code> to the public HTTPS tee-proxy endpoint before running this flow.
        </div>
      )}
      {error && <div className="journey-alert journey-alert--error" role="alert">{error}</div>}
      {notice && <div className="journey-alert journey-alert--success" role="status">{notice}</div>}

      <ol className="journey__steps">
        <li className={account ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">1</div>
          <div className="journey-step__content">
            <h2>Connect your wallet</h2>
            <p>Jorqeth switches the wallet to Flare Testnet Coston2.</p>
            <button className="btn btn--primary" onClick={connectWallet} disabled={busy === "connect"}>
              {account ? `${account.slice(0, 8)}…${account.slice(-6)}` : busy === "connect" ? "Connecting…" : "Connect wallet"}
            </button>
          </div>
        </li>

        <li className={campaign ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">2</div>
          <div className="journey-step__content">
            <h2>Create an FCE-bound campaign</h2>
            <p>The factory creates a settlement contract whose verifier accepts only an active TEE for Jorqeth extension {deployment.fceExtensionId}.</p>
            <label className="field"><span>Creator payout wallet</span><input value={creator} onChange={(event) => setCreator(event.target.value)} /></label>
            <label className="field field--short"><span>Commission percentage</span><div className="field__unit"><input inputMode="decimal" value={commissionPercent} onChange={(event) => setCommissionPercent(event.target.value)} /><span>%</span></div></label>
            <button className="btn btn--primary" onClick={createCampaign} disabled={!account || chainId !== coston2.id || Boolean(campaign) || busy === "create"}>
              {busy === "create" ? "Creating…" : campaign ? "FCE campaign created" : "Create FCE campaign"}
            </button>
            {campaign && <a className="journey-link" href={`${EXPLORER}/address/${campaign}`} target="_blank" rel="noreferrer">Open campaign on explorer</a>}
          </div>
        </li>

        <li className={escrowBalance > BigInt(0) ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">3</div>
          <div className="journey-step__content">
            <h2>Fund escrow</h2>
            <p>Mint faucet-only mUSD, approve the new settlement, and lock the test payout budget.</p>
            <label className="field field--short"><span>Escrow amount</span><div className="field__unit"><input inputMode="decimal" value={escrowAmount} onChange={(event) => setEscrowAmount(event.target.value)} /><span>mUSD</span></div></label>
            <button className="btn btn--primary" onClick={fundCampaign} disabled={!campaign || busy === "fund"}>
              {busy === "fund" ? "Funding…" : "Fund FCE campaign"}
            </button>
            {campaign && <span className="journey-muted">Escrow: {formatUnits(escrowBalance, 6)} mUSD</span>}
          </div>
        </li>

        <li className={evaluation ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">4</div>
          <div className="journey-step__content">
            <h2>Run the private evaluation through Flare FCE</h2>
            <p>The reference is hashed on the public side. The configured private record remains inside the extension runtime. The browser receives only the signed ActionResult.</p>
            <label className="field"><span>Agreed private record reference</span><input autoComplete="off" value={recordReference} onChange={(event) => setRecordReference(event.target.value)} /><small>Coston2 FCE demo record: {DEFAULT_REFERENCE}</small></label>
            <button className="btn btn--primary" onClick={runFceEvaluation} disabled={!ready || !campaign || escrowBalance === BigInt(0) || busy === "fce"}>
              {busy === "fce" ? "Waiting for TEE result…" : "Run with Flare FCE"}
            </button>
            {evaluation && (
              <a className="journey-link" href={`${EXPLORER}/tx/${evaluation.instructionTx}`} target="_blank" rel="noreferrer">
                Open FCE instruction transaction
              </a>
            )}
          </div>
        </li>

        <li className={settlementHash ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">5</div>
          <div className="journey-step__content">
            <h2>Verify the TEE result and settle</h2>
            <p>FccResultVerifier reconstructs Flare&apos;s ActionResult signing hash and checks the recovered signer against the current active TEE set before value moves.</p>
            {evaluation && <span className="journey-muted">TEE result: {formatUnits(evaluation.result.amount, 6)} mUSD · status {evaluation.result.eligibilityCode === 1 ? "eligible" : "ineligible"}</span>}
            <button className="btn btn--primary" onClick={settleCommission} disabled={!evaluation || Boolean(settlementHash) || busy === "settle"}>
              {busy === "settle" ? "Settling…" : settlementHash ? "Settled" : "Settle FCE-verified result"}
            </button>
            {settlementHash && <a className="journey-link" href={`${EXPLORER}/tx/${settlementHash}`} target="_blank" rel="noreferrer">Open settlement transaction</a>}
          </div>
        </li>

        <li className={verified ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">6</div>
          <div className="journey-step__content">
            <h2>Verify exact-once settlement</h2>
            <p>The order digest closes after settlement and cannot pay twice.</p>
            <span className="journey-muted">Settled: {formatUnits(totalSettled, 6)} mUSD · Remaining escrow: {formatUnits(escrowBalance, 6)} mUSD</span>
            {verified && <b>Verified on Coston2.</b>}
          </div>
        </li>
      </ol>

      <section className="journey__reference">
        <div>
          <h2>Need the fast disclosed-signer demo?</h2>
          <p>The legacy demo remains available separately. The primary flow above is the sponsor-native FCE path.</p>
        </div>
        <div className="hero__actions">
          <Link className="btn btn--tinted" href="/app/demo">Open disclosed-signer demo</Link>
          {campaign && <button className="btn btn--tinted" onClick={resetCampaign}>Start a new FCE campaign</button>}
        </div>
      </section>
    </div>
  );
}
