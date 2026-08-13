"use client";

import { useEffect, useMemo, useState } from "react";
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
  fceInstructionSenderAbi,
  FLARE_COSTON2_FAUCET_URL,
  fxrpDeploymentConfigured,
  payableResultTypes,
  publicClient,
  settlementAbi,
  type PayableResult,
} from "@/lib/jorqeth";

type WalletProvider = EIP1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type PrivateCheckResponse = {
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

type CheckResult = {
  result: PayableResult;
  proof: Hex;
  instructionId: Hex;
  instructionTx: Hex;
};

type PendingCheck = {
  campaign: Address;
  instructionId: Hex;
  instructionTx: Hex;
  startedAt: number;
};

const CAMPAIGN_KEY = "jorqeth.fceCampaign.fxrp";
const PENDING_KEY = "jorqeth.pendingCheck.fxrp";
const DEFAULT_REFERENCE = "private-order-1";
const ASSET_DECIMALS = 6;
const INSTRUCTION_FEE = BigInt(1_000_000);
const EXPLORER = coston2.blockExplorers.default.url;

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function friendlyError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (message) console.error("Jorqeth payment error:", error);

  if (/rejected|denied|cancelled/i.test(message)) {
    return "The wallet request was cancelled. You can try again when ready.";
  }
  if (/insufficient funds/i.test(message)) {
    return "You need a little more test FLR for network fees.";
  }
  if (/too close to expiry/i.test(message)) {
    return "This payment setup has expired. Start a new payment to continue.";
  }
  if (/pending|polling|temporarily unavailable|could not be reached|proxy/i.test(message)) {
    return "The private check is taking longer than usual. Your funds are unchanged, and you can check the result again.";
  }
  if (/revert|failed on flare|verification|signature|different settlement/i.test(message)) {
    return "The payment was stopped safely. No incorrect payment was made.";
  }

  return fallback;
}

function readPending(): PendingCheck | undefined {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as PendingCheck;
    if (!isAddress(parsed.campaign) || !/^0x[0-9a-fA-F]{64}$/.test(parsed.instructionId) || !/^0x[0-9a-fA-F]{64}$/.test(parsed.instructionTx)) {
      window.localStorage.removeItem(PENDING_KEY);
      return undefined;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(PENDING_KEY);
    return undefined;
  }
}

export default function FxrpPaymentFlow() {
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [recipient, setRecipient] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("1");
  const [fundAmount, setFundAmount] = useState("5");
  const [campaign, setCampaign] = useState<Address>();
  const [recordReference, setRecordReference] = useState(DEFAULT_REFERENCE);
  const [checkResult, setCheckResult] = useState<CheckResult>();
  const [pendingCheck, setPendingCheck] = useState<PendingCheck>();
  const [paymentHash, setPaymentHash] = useState<Hex>();
  const [availableFunds, setAvailableFunds] = useState(BigInt(0));
  const [totalPaid, setTotalPaid] = useState(BigInt(0));
  const [walletFxrp, setWalletFxrp] = useState(BigInt(0));
  const [paid, setPaid] = useState(false);
  const [serviceReady, setServiceReady] = useState<boolean>();
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  const provider = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return (window as typeof window & { ethereum?: WalletProvider }).ethereum;
  }, []);

  useEffect(() => {
    void refreshService();
    const savedCampaign = window.localStorage.getItem(CAMPAIGN_KEY);
    if (savedCampaign && isAddress(savedCampaign)) setCampaign(savedCampaign);
    const savedPending = readPending();
    if (savedPending) setPendingCheck(savedPending);
  }, []);

  useEffect(() => {
    if (!provider) return;
    const accountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as Address[] | undefined;
      setAccount(accounts?.[0]);
      if (accounts?.[0]) setRecipient((current) => current || accounts[0]);
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
    if (account) void refreshWalletFxrp(account);
  }, [account]);

  useEffect(() => {
    if (!pendingCheck || !campaign || pendingCheck.campaign.toLowerCase() !== campaign.toLowerCase()) return;
    void resumePrivateCheck(true);
    // Resume once when a saved check belongs to the current payment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign]);

  function walletClient() {
    if (!provider || !account) throw new Error("Connect your wallet first.");
    return createWalletClient({ account, chain: coston2, transport: custom(provider) });
  }

  function clearMessages() {
    setError(undefined);
    setNotice(undefined);
  }

  async function refreshService() {
    try {
      const response = await fetch("/api/fce-result?health=1", { cache: "no-store" });
      const payload = (await response.json()) as { ready?: boolean; configured?: boolean };
      setServiceReady(Boolean(payload.ready ?? payload.configured));
    } catch {
      setServiceReady(false);
    }
  }

  async function connectWallet() {
    clearMessages();
    if (!provider) {
      setError("No wallet was found. Open this page in a browser with an EVM wallet such as MetaMask.");
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
      setRecipient((currentRecipient) => currentRecipient || accounts[0]);
      setChainId(coston2.id);
      await refreshWalletFxrp(accounts[0]);
      setNotice("Wallet connected. You’re ready to set up the payment.");
    } catch (cause) {
      setError(friendlyError(cause, "We couldn’t connect your wallet. Check it and try again."));
    } finally {
      setBusy(undefined);
    }
  }

  async function createPayment() {
    clearMessages();
    if (!deployment.fxrpFactory || !account) {
      setError("Payment setup is temporarily unavailable. Try again shortly.");
      return;
    }
    if (!isAddress(recipient)) {
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
      const campaignId = keccak256(encodePacked(["address", "uint256"], [account, BigInt(Date.now())]));
      const ruleVersion = keccak256(toBytes(`jorqeth.floor.v1:${commissionBps}`));
      const campaignEnd = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);
      const hash = await walletClient().writeContract({
        address: deployment.fxrpFactory,
        abi: factoryAbi,
        functionName: "createCampaign",
        args: [campaignId, recipient, commissionBps, ruleVersion, campaignEnd],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const [created] = parseEventLogs({ abi: factoryAbi, eventName: "CampaignCreated", logs: receipt.logs });
      const address = created?.args.settlement;
      if (!address) throw new Error("Payment address missing from receipt.");

      setCampaign(address);
      setCheckResult(undefined);
      setPendingCheck(undefined);
      setPaymentHash(undefined);
      setPaid(false);
      window.localStorage.setItem(CAMPAIGN_KEY, address);
      window.localStorage.removeItem(PENDING_KEY);
      setNotice("Payment created. Add test FXRP to cover the commission.");
    } catch (cause) {
      setError(friendlyError(cause, "We couldn’t create the payment. No funds were moved. Try again."));
    } finally {
      setBusy(undefined);
    }
  }

  async function addFunds() {
    clearMessages();
    if (!deployment.fxrpToken || !campaign || !account) {
      setError("Connect your wallet and create the payment first.");
      return;
    }

    let amount: bigint;
    try {
      amount = parseUnits(fundAmount, ASSET_DECIMALS);
      if (amount <= BigInt(0)) throw new Error("zero amount");
    } catch {
      setError("Enter an amount greater than zero.");
      return;
    }

    setBusy("fund");
    try {
      const balance = await publicClient.readContract({
        address: deployment.fxrpToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      });
      setWalletFxrp(balance);
      if (balance < amount) {
        setError(`You need ${formatUnits(amount, ASSET_DECIMALS)} test FXRP. Get free test FXRP, then try again.`);
        return;
      }

      const wallet = walletClient();
      const approveHash = await wallet.writeContract({
        address: deployment.fxrpToken,
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
      await Promise.all([refreshCampaign(campaign), refreshWalletFxrp(account)]);
      setNotice("Funds added. You can check the private record now.");
    } catch (cause) {
      setError(friendlyError(cause, "We couldn’t add the funds. Check your wallet and try again."));
    } finally {
      setBusy(undefined);
    }
  }

  function decodePrivateCheck(action: PrivateCheckResponse, instructionId: Hex, instructionTx: Hex): CheckResult {
    if (action.result.status !== 1) {
      throw new Error(action.result.log || "Private check did not approve this payment.");
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

    if (!campaign || result.settlementContract.toLowerCase() !== campaign.toLowerCase()) {
      throw new Error("Private check belongs to a different payment.");
    }

    const proof = encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes" }, { type: "uint8" }, { type: "bytes" }],
      [instructionId, toHex(action.result.submissionTag), action.result.status, action.signature],
    );

    return { result, proof, instructionId, instructionTx };
  }

  async function fetchPrivateCheck(instructionId: Hex) {
    const response = await fetch(`/api/fce-result?instructionId=${instructionId}`, { cache: "no-store" });
    if (response.status === 202) return undefined;
    const payload = (await response.json()) as PrivateCheckResponse & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Private check could not be reached.");
    return payload;
  }

  async function pollPrivateCheck(pending: PendingCheck, attempts: number) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const action = await fetchPrivateCheck(pending.instructionId);
      if (action) return action;
      if (attempt < attempts - 1) await sleep(2_000);
    }
    return undefined;
  }

  async function runPrivateCheck() {
    clearMessages();
    if (!fxrpDeploymentConfigured || !serviceReady) {
      setError("The private check is temporarily unavailable. Your funds are unchanged. Try again shortly.");
      return;
    }
    if (!campaign || !deployment.fceInstructionSender) {
      setError("Create the payment and add funds first.");
      return;
    }
    if (!recordReference.trim()) {
      setError("Enter the agreed order reference.");
      return;
    }

    setBusy("check");
    try {
      const [campaignId, recipientAddress, commissionBps, ruleVersion, campaignEnd] = await Promise.all([
        publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "campaignId" }),
        publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "creator" }),
        publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "commissionBps" }),
        publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "ruleVersion" }),
        publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "campaignEnd" }),
      ]);
      const issuedAt = (await publicClient.getBlock({ blockTag: "latest" })).timestamp;
      const expiry = issuedAt + BigInt(900) < campaignEnd ? issuedAt + BigInt(900) : campaignEnd;
      if (expiry <= issuedAt + BigInt(60)) throw new Error("Payment is too close to expiry.");

      const orderDigest = keccak256(toBytes(recordReference.trim()));
      const nonce = keccak256(encodePacked(["bytes32", "address", "uint256"], [orderDigest, campaign, BigInt(Date.now())]));
      const request = {
        schemaVersion: 1,
        campaignId,
        orderDigest,
        creator: recipientAddress,
        commissionBps: Number(commissionBps),
        chainId: coston2.id,
        settlementContract: campaign,
        ruleVersion,
        nonce,
        issuedAt: Number(issuedAt),
        expiry: Number(expiry),
      };

      setNotice("Private check submitted. We’re waiting for the result.");
      const instructionTx = await walletClient().writeContract({
        address: deployment.fceInstructionSender,
        abi: fceInstructionSenderAbi,
        functionName: "sendEvaluation",
        args: [toHex(JSON.stringify(request))],
        value: INSTRUCTION_FEE,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: instructionTx });
      const sent = parseEventLogs({ abi: fceInstructionSenderAbi, eventName: "EvaluationInstructionSent", logs: receipt.logs })[0];
      const instructionId = sent?.args.instructionId;
      if (!instructionId) throw new Error("Private check ID missing from receipt.");

      const pending: PendingCheck = { campaign, instructionId, instructionTx, startedAt: Date.now() };
      setPendingCheck(pending);
      window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));

      const action = await pollPrivateCheck(pending, 60);
      if (!action) {
        setNotice("Your private check is still processing. You can leave this page and come back, or check the result again below.");
        return;
      }

      const decoded = decodePrivateCheck(action, instructionId, instructionTx);
      setCheckResult(decoded);
      setPendingCheck(undefined);
      window.localStorage.removeItem(PENDING_KEY);
      setNotice(`Check complete. ${formatUnits(decoded.result.amount, ASSET_DECIMALS)} test FXRP is due.`);
    } catch (cause) {
      setError(friendlyError(cause, "We couldn’t complete the private check. Your funds are unchanged."));
    } finally {
      setBusy(undefined);
    }
  }

  async function resumePrivateCheck(silent = false) {
    const pending = pendingCheck ?? readPending();
    if (!pending || !campaign || pending.campaign.toLowerCase() !== campaign.toLowerCase()) return;
    if (!silent) clearMessages();
    setBusy("resume");
    try {
      const action = await pollPrivateCheck(pending, silent ? 1 : 30);
      if (!action) {
        if (!silent) setNotice("The private check is still processing. No need to submit it again. Check again in a moment.");
        return;
      }
      const decoded = decodePrivateCheck(action, pending.instructionId, pending.instructionTx);
      setCheckResult(decoded);
      setPendingCheck(undefined);
      window.localStorage.removeItem(PENDING_KEY);
      setNotice(`Check complete. ${formatUnits(decoded.result.amount, ASSET_DECIMALS)} test FXRP is due.`);
    } catch (cause) {
      setError(friendlyError(cause, "We couldn’t fetch the private check yet. Try again shortly."));
    } finally {
      setBusy(undefined);
    }
  }

  async function payCommission() {
    clearMessages();
    if (!campaign || !checkResult) {
      setError("Check the private record first.");
      return;
    }

    const latestAvailable = await publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "escrowBalance" });
    setAvailableFunds(latestAvailable);
    if (latestAvailable < checkResult.result.amount) {
      const missing = checkResult.result.amount - latestAvailable;
      setError(`You need ${formatUnits(missing, ASSET_DECIMALS)} more test FXRP before this commission can be paid. Add funds, then try again.`);
      return;
    }

    setBusy("pay");
    try {
      const hash = await walletClient().writeContract({
        address: campaign,
        abi: settlementAbi,
        functionName: "settle",
        args: [checkResult.result, checkResult.proof],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setPaymentHash(hash);
      await verifyPayment(campaign, checkResult.result.orderDigest);
      if (account) await refreshWalletFxrp(account);
      setNotice("Payment complete. The commission was paid on Flare.");
    } catch (cause) {
      setError(friendlyError(cause, "The payment did not complete. No incorrect payment was made."));
    } finally {
      setBusy(undefined);
    }
  }

  async function verifyPayment(address: Address, orderDigest: Hex) {
    const [once, funds, total] = await Promise.all([
      publicClient.readContract({ address, abi: settlementAbi, functionName: "settled", args: [orderDigest] }),
      publicClient.readContract({ address, abi: settlementAbi, functionName: "escrowBalance" }),
      publicClient.readContract({ address, abi: settlementAbi, functionName: "totalSettled" }),
    ]);
    setPaid(once);
    setAvailableFunds(funds);
    setTotalPaid(total);
  }

  async function refreshCampaign(address: Address) {
    try {
      const [funds, total, savedRecipient, savedCommissionBps] = await Promise.all([
        publicClient.readContract({ address, abi: settlementAbi, functionName: "escrowBalance" }),
        publicClient.readContract({ address, abi: settlementAbi, functionName: "totalSettled" }),
        publicClient.readContract({ address, abi: settlementAbi, functionName: "creator" }),
        publicClient.readContract({ address, abi: settlementAbi, functionName: "commissionBps" }),
      ]);
      setAvailableFunds(funds);
      setTotalPaid(total);
      setRecipient(savedRecipient);
      setCommissionPercent((Number(savedCommissionBps) / 100).toString());
    } catch (cause) {
      console.error("Could not refresh saved payment:", cause);
      window.localStorage.removeItem(CAMPAIGN_KEY);
      setCampaign(undefined);
    }
  }

  async function refreshWalletFxrp(address: Address) {
    if (!deployment.fxrpToken) return;
    try {
      const balance = await publicClient.readContract({
        address: deployment.fxrpToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });
      setWalletFxrp(balance);
    } catch (cause) {
      console.error("Could not refresh wallet FXRP balance:", cause);
    }
  }

  function startOver() {
    window.localStorage.removeItem(CAMPAIGN_KEY);
    window.localStorage.removeItem(PENDING_KEY);
    setCampaign(undefined);
    setPendingCheck(undefined);
    setCheckResult(undefined);
    setPaymentHash(undefined);
    setAvailableFunds(BigInt(0));
    setTotalPaid(BigInt(0));
    setPaid(false);
    setRecipient(account || "");
    clearMessages();
  }

  const shortfall = checkResult && availableFunds < checkResult.result.amount
    ? checkResult.result.amount - availableFunds
    : BigInt(0);

  return (
    <div className="journey">
      <section className="journey__intro">
        <div>
          <span className="eyebrow">Test mode</span>
          <h1>Pay a private commission in FXRP.</h1>
          <p>
            Choose who gets paid, add test FXRP, enter the agreed order reference, and Jorqeth checks the private record before paying the exact commission.
          </p>
        </div>
        <div className={`network-card${serviceReady ? " network-card--ready" : ""}`}>
          <span className="dot" />
          <div>
            <b>{serviceReady === undefined ? "Checking service…" : serviceReady ? "Private check ready" : "Private check unavailable"}</b>
            <span>Test FXRP · Flare testnet</span>
          </div>
        </div>
      </section>

      {error && <div className="journey-alert journey-alert--error" role="alert">{error}</div>}
      {notice && <div className="journey-alert journey-alert--success" role="status">{notice}</div>}

      <ol className="journey__steps">
        <li className={account ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">1</div>
          <div className="journey-step__content">
            <h2>Connect your wallet</h2>
            <p>Jorqeth will set up the test network for you if needed.</p>
            <button className="btn btn--primary" onClick={connectWallet} disabled={busy === "connect"}>
              {account ? `${account.slice(0, 8)}…${account.slice(-6)}` : busy === "connect" ? "Connecting…" : "Connect wallet"}
            </button>
            {account && <span className="journey-muted">Your test FXRP: {formatUnits(walletFxrp, ASSET_DECIMALS)}</span>}
          </div>
        </li>

        <li className={campaign ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">2</div>
          <div className="journey-step__content">
            <h2>Set the commission</h2>
            <p>Choose who gets paid and what percentage they should receive.</p>
            <label className="field"><span>Who gets paid?</span><input value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label>
            <label className="field field--short"><span>Commission rate</span><div className="field__unit"><input inputMode="decimal" value={commissionPercent} onChange={(event) => setCommissionPercent(event.target.value)} /><span>%</span></div></label>
            <button className="btn btn--primary" onClick={createPayment} disabled={!account || chainId !== coston2.id || Boolean(campaign) || busy === "create"}>
              {busy === "create" ? "Creating…" : campaign ? "Payment created" : "Create payment"}
            </button>
          </div>
        </li>

        <li className={availableFunds > BigInt(0) ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">3</div>
          <div className="journey-step__content">
            <h2>Add funds</h2>
            <p>Add enough test FXRP to cover the commission when it is due.</p>
            <label className="field field--short"><span>Amount to add</span><div className="field__unit"><input inputMode="decimal" value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} /><span>FXRP</span></div></label>
            <button className="btn btn--primary" onClick={addFunds} disabled={!campaign || busy === "fund"}>
              {busy === "fund" ? "Adding…" : "Add FXRP"}
            </button>
            <a className="journey-link" href={FLARE_COSTON2_FAUCET_URL} target="_blank" rel="noreferrer">Get free test FXRP</a>
            {campaign && <span className="journey-muted">Available to pay: {formatUnits(availableFunds, ASSET_DECIMALS)} test FXRP</span>}
          </div>
        </li>

        <li className={checkResult ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">4</div>
          <div className="journey-step__content">
            <h2>Check the private record</h2>
            <p>Enter the agreed order reference. The sales record itself stays private.</p>
            <label className="field"><span>Order reference</span><input autoComplete="off" value={recordReference} onChange={(event) => setRecordReference(event.target.value)} /><small>Demo reference: {DEFAULT_REFERENCE}</small></label>
            {!pendingCheck && !checkResult && (
              <button className="btn btn--primary" onClick={runPrivateCheck} disabled={!serviceReady || !campaign || availableFunds === BigInt(0) || busy === "check"}>
                {busy === "check" ? "Checking…" : "Check record"}
              </button>
            )}
            {pendingCheck && !checkResult && (
              <div className="hero__actions">
                <button className="btn btn--primary" onClick={() => void resumePrivateCheck(false)} disabled={busy === "resume" || busy === "check"}>
                  {busy === "resume" ? "Checking…" : "Check result again"}
                </button>
                <a className="btn btn--tinted" href={`${EXPLORER}/tx/${pendingCheck.instructionTx}`} target="_blank" rel="noreferrer">View submitted check</a>
              </div>
            )}
            {checkResult && <span className="journey-muted">Amount due: {formatUnits(checkResult.result.amount, ASSET_DECIMALS)} test FXRP</span>}
          </div>
        </li>

        <li className={paymentHash ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">5</div>
          <div className="journey-step__content">
            <h2>Pay the commission</h2>
            {!checkResult && <p>Complete the private check first. Jorqeth will show the exact amount due here.</p>}
            {checkResult && (
              <>
                <p>Amount due: <b>{formatUnits(checkResult.result.amount, ASSET_DECIMALS)} test FXRP</b></p>
                {shortfall > BigInt(0) && <div className="journey-alert journey-alert--warning">Add {formatUnits(shortfall, ASSET_DECIMALS)} more test FXRP before paying.</div>}
                <button className="btn btn--primary" onClick={payCommission} disabled={Boolean(paymentHash) || busy === "pay" || shortfall > BigInt(0)}>
                  {busy === "pay" ? "Paying…" : paymentHash ? "Paid" : `Pay ${formatUnits(checkResult.result.amount, ASSET_DECIMALS)} FXRP`}
                </button>
              </>
            )}
          </div>
        </li>

        <li className={paid ? "journey-step journey-step--done" : "journey-step"}>
          <div className="journey-step__number">6</div>
          <div className="journey-step__content">
            <h2>Done</h2>
            <p>After payment, the same order cannot be paid twice.</p>
            <span className="journey-muted">Paid: {formatUnits(totalPaid, ASSET_DECIMALS)} test FXRP · Left: {formatUnits(availableFunds, ASSET_DECIMALS)} test FXRP</span>
            {paid && <b>Payment confirmed.</b>}
          </div>
        </li>
      </ol>

      <section className="journey__reference">
        <div>
          <h2>Need to start over?</h2>
          <p>Create a fresh payment without changing anything already recorded on Flare.</p>
        </div>
        {campaign && <button className="btn btn--tinted" onClick={startOver}>Start a new payment</button>}
      </section>
    </div>
  );
}
