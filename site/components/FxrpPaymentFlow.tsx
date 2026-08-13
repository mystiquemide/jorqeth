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

type TransactionFeedback = {
  hash: Hex;
  label: string;
  status: "pending" | "success" | "failed";
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
    return "The wallet request was cancelled. Nothing changed.";
  }
  if (/NotMerchant|only the wallet that created/i.test(message)) {
    return "Only the wallet that created this payment can add funds. Switch back to that wallet and try again.";
  }
  if (/AlreadySettled|already paid/i.test(message)) {
    return "This order has already been paid from this payment. Use a different order reference.";
  }
  if (/insufficient funds|exceeds balance|transfer amount exceeds balance/i.test(message)) {
    return "There isn’t enough balance for this transaction. Check your test FXRP and test FLR balances, then try again.";
  }
  if (/allowance|approval/i.test(message) && /revert|failed|insufficient/i.test(message)) {
    return "The FXRP approval did not complete, so no funds were added. Try the approval again.";
  }
  if (/timeout|timed out|time-out/i.test(message)) {
    return "The network is taking longer than expected. Check the transaction below before trying again.";
  }
  if (/too close to expiry/i.test(message)) {
    return "This payment setup has expired. Start a new payment to continue.";
  }
  if (/pending|polling|temporarily unavailable|could not be reached|proxy/i.test(message)) {
    return "The private check is taking longer than usual. Your funds are unchanged, and you can check the result again.";
  }
  if (/revert|failed on flare|execution reverted|verification|signature|different settlement/i.test(message)) {
    return "The transaction failed safely. No incorrect payment was made.";
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
  const [lastTx, setLastTx] = useState<TransactionFeedback>();

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

  async function confirmTransaction(hash: Hex, label: string) {
    setLastTx({ hash, label, status: "pending" });
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
      setLastTx({ hash, label, status: "success" });
      return receipt;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setLastTx({ hash, label, status: /timeout|timed out|time-out/i.test(message) ? "pending" : "failed" });
      throw cause;
    }
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
      setNotice("Wallet connected. Set who gets paid and the commission rate.");
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
    setLastTx(undefined);
    try {
      const campaignId = keccak256(encodePacked(["address", "uint256"], [account, BigInt(Date.now())]));
      const ruleVersion = keccak256(toBytes(`jorqeth.floor.v1:${commissionBps}`));
      const campaignEnd = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);
      const { request } = await publicClient.simulateContract({
        account,
        address: deployment.fxrpFactory,
        abi: factoryAbi,
        functionName: "createCampaign",
        args: [campaignId, recipient, commissionBps, ruleVersion, campaignEnd],
      });
      const hash = await walletClient().writeContract(request);
      const receipt = await confirmTransaction(hash, "Create payment");
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
      setNotice("Payment ready. You can add funds or check an order now.");
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
    setLastTx(undefined);
    try {
      const [balance, merchant] = await Promise.all([
        publicClient.readContract({
          address: deployment.fxrpToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account],
        }),
        publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "merchant" }),
      ]);

      setWalletFxrp(balance);
      if (merchant.toLowerCase() !== account.toLowerCase()) {
        throw new Error("NotMerchant: only the wallet that created this payment can fund it.");
      }
      if (balance < amount) {
        setError(`Your wallet has ${formatUnits(balance, ASSET_DECIMALS)} test FXRP. Add a smaller amount or get more test FXRP.`);
        return;
      }

      const wallet = walletClient();
      setNotice(`First, approve ${formatUnits(amount, ASSET_DECIMALS)} test FXRP in your wallet.`);
      const { request: approveRequest } = await publicClient.simulateContract({
        account,
        address: deployment.fxrpToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [campaign, amount],
      });
      const approveHash = await wallet.writeContract(approveRequest);
      await confirmTransaction(approveHash, "Approve FXRP");

      setNotice(`Approval confirmed. Now confirm adding ${formatUnits(amount, ASSET_DECIMALS)} test FXRP.`);
      const { request: fundRequest } = await publicClient.simulateContract({
        account,
        address: campaign,
        abi: settlementAbi,
        functionName: "fund",
        args: [amount],
      });
      const fundHash = await wallet.writeContract(fundRequest);
      await confirmTransaction(fundHash, "Add FXRP");

      await Promise.all([refreshCampaign(campaign), refreshWalletFxrp(account)]);
      setNotice(`${formatUnits(amount, ASSET_DECIMALS)} test FXRP added successfully.`);
    } catch (cause) {
      setError(friendlyError(cause, "We couldn’t add the funds. Nothing was taken from your wallet."));
    } finally {
      await Promise.allSettled([refreshCampaign(campaign), refreshWalletFxrp(account)]);
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
      setError("Create the payment first.");
      return;
    }
    if (!recordReference.trim()) {
      setError("Enter the agreed order reference.");
      return;
    }

    setBusy("check");
    setLastTx(undefined);
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
      const alreadyPaid = await publicClient.readContract({
        address: campaign,
        abi: settlementAbi,
        functionName: "settled",
        args: [orderDigest],
      });
      if (alreadyPaid) throw new Error("AlreadySettled: this order was already paid.");

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

      const { request: instructionRequest } = await publicClient.simulateContract({
        account,
        address: deployment.fceInstructionSender,
        abi: fceInstructionSenderAbi,
        functionName: "sendEvaluation",
        args: [toHex(JSON.stringify(request))],
        value: INSTRUCTION_FEE,
      });
      setNotice("Confirm the private check in your wallet. Your sales record stays private.");
      const instructionTx = await walletClient().writeContract(instructionRequest);
      const receipt = await confirmTransaction(instructionTx, "Submit private check");
      const sent = parseEventLogs({ abi: fceInstructionSenderAbi, eventName: "EvaluationInstructionSent", logs: receipt.logs })[0];
      const instructionId = sent?.args.instructionId;
      if (!instructionId) throw new Error("Private check ID missing from receipt.");

      const pending: PendingCheck = { campaign, instructionId, instructionTx, startedAt: Date.now() };
      setPendingCheck(pending);
      window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      setNotice("Check submitted. Jorqeth is waiting for the private result.");

      const action = await pollPrivateCheck(pending, 60);
      if (!action) {
        setNotice("The check is still processing. You can leave this page and come back without submitting it again.");
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
    if (!campaign || !checkResult || !account) {
      setError("Check the private record first.");
      return;
    }

    const latestAvailable = await publicClient.readContract({ address: campaign, abi: settlementAbi, functionName: "escrowBalance" });
    setAvailableFunds(latestAvailable);
    if (latestAvailable < checkResult.result.amount) {
      const missing = checkResult.result.amount - latestAvailable;
      setError(`Add ${formatUnits(missing, ASSET_DECIMALS)} more test FXRP before paying this commission.`);
      return;
    }

    setBusy("pay");
    setLastTx(undefined);
    try {
      const { request } = await publicClient.simulateContract({
        account,
        address: campaign,
        abi: settlementAbi,
        functionName: "settle",
        args: [checkResult.result, checkResult.proof],
      });
      const hash = await walletClient().writeContract(request);
      await confirmTransaction(hash, "Pay commission");
      setPaymentHash(hash);
      await verifyPayment(campaign, checkResult.result.orderDigest);
      await refreshWalletFxrp(account);
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

  function handleReferenceChange(value: string) {
    setRecordReference(value);
    if (checkResult || paymentHash || paid) {
      setCheckResult(undefined);
      setPaymentHash(undefined);
      setPaid(false);
      clearMessages();
    }
  }

  function startNextOrder() {
    setCheckResult(undefined);
    setPendingCheck(undefined);
    setPaymentHash(undefined);
    setPaid(false);
    setRecordReference("");
    window.localStorage.removeItem(PENDING_KEY);
    clearMessages();
    setLastTx(undefined);
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
    setRecordReference(DEFAULT_REFERENCE);
    clearMessages();
    setLastTx(undefined);
  }

  const shortfall = checkResult && availableFunds < checkResult.result.amount
    ? checkResult.result.amount - availableFunds
    : BigInt(0);
  const setupDone = Boolean(campaign);
  const checkDone = Boolean(checkResult) || paid;
  const payDone = paid;

  return (
    <div className="payment-console">
      <section className="payment-console__head">
        <div>
          <span className="eyebrow">Test payment</span>
          <h1>Pay a commission.</h1>
          <p>Set the terms once. For each order, Jorqeth checks the private record and shows the exact amount to pay.</p>
        </div>
        <div className={`payment-service${serviceReady ? " payment-service--ready" : ""}`}>
          <span className="dot" />
          <span>{serviceReady === undefined ? "Checking…" : serviceReady ? "Private check ready" : "Private check unavailable"}</span>
        </div>
      </section>

      <div className="payment-progress" aria-label="Payment progress">
        <div className={`payment-progress__item${setupDone ? " is-done" : " is-active"}`}>
          <span>1</span><div><b>Set up</b><small>Recipient and rate</small></div>
        </div>
        <div className={`payment-progress__item${checkDone ? " is-done" : setupDone ? " is-active" : ""}`}>
          <span>2</span><div><b>Check order</b><small>Private record</small></div>
        </div>
        <div className={`payment-progress__item${payDone ? " is-done" : checkResult && !paid ? " is-active" : ""}`}>
          <span>3</span><div><b>Pay</b><small>Exact commission</small></div>
        </div>
      </div>

      <div className="payment-console__grid">
        <main className="payment-task">
          {error && <div className="payment-message payment-message--error" role="alert"><b>Couldn’t complete that</b><span>{error}</span></div>}
          {notice && <div className="payment-message payment-message--success" role="status"><b>Status</b><span>{notice}</span></div>}
          {lastTx && (
            <div className={`payment-tx payment-tx--${lastTx.status}`}>
              <div>
                <b>{lastTx.label}</b>
                <span>{lastTx.status === "success" ? "Confirmed" : lastTx.status === "failed" ? "Failed" : "Waiting for confirmation"}</span>
              </div>
              <a href={`${EXPLORER}/tx/${lastTx.hash}`} target="_blank" rel="noreferrer">View transaction</a>
            </div>
          )}

          {!account && (
            <section className="payment-task__body">
              <span className="payment-task__kicker">Start here</span>
              <h2>Connect the wallet that will fund the payment.</h2>
              <p>Jorqeth will switch it to Flare testnet automatically if needed.</p>
              <button className="btn btn--primary" onClick={connectWallet} disabled={busy === "connect"}>
                {busy === "connect" ? "Connecting…" : "Connect wallet"}
              </button>
            </section>
          )}

          {account && !campaign && (
            <section className="payment-task__body">
              <span className="payment-task__kicker">Set up payment</span>
              <h2>Who gets paid, and what is their commission?</h2>
              <p>You set this once for the payment. The private sales record is checked later for each order.</p>
              <div className="payment-form-grid">
                <label className="field"><span>Recipient wallet</span><input value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label>
                <label className="field field--short"><span>Commission</span><div className="field__unit"><input inputMode="decimal" value={commissionPercent} onChange={(event) => setCommissionPercent(event.target.value)} /><span>%</span></div></label>
              </div>
              <button className="btn btn--primary" onClick={createPayment} disabled={chainId !== coston2.id || busy === "create"}>
                {busy === "create" ? "Creating payment…" : "Create payment"}
              </button>
            </section>
          )}

          {account && campaign && !checkResult && !paid && (
            <section className="payment-task__body">
              <span className="payment-task__kicker">Next action</span>
              <h2>{pendingCheck ? "Your private check is processing." : "Which order should Jorqeth check?"}</h2>
              <p>{pendingCheck ? "You do not need to submit another transaction. Ask Jorqeth for the result again." : "Enter the agreed order reference. The underlying sales record stays private."}</p>
              <label className="field">
                <span>Order reference</span>
                <input autoComplete="off" value={recordReference} disabled={Boolean(pendingCheck)} onChange={(event) => handleReferenceChange(event.target.value)} />
                <small>Demo reference: {DEFAULT_REFERENCE}. Use a different reference if that order has already been paid.</small>
              </label>
              {!pendingCheck && (
                <button className="btn btn--primary" onClick={runPrivateCheck} disabled={!serviceReady || busy === "check"}>
                  {busy === "check" ? "Checking order…" : "Check order"}
                </button>
              )}
              {pendingCheck && (
                <div className="payment-actions">
                  <button className="btn btn--primary" onClick={() => void resumePrivateCheck(false)} disabled={busy === "resume" || busy === "check"}>
                    {busy === "resume" ? "Checking…" : "Check result again"}
                  </button>
                  <a className="btn btn--tinted" href={`${EXPLORER}/tx/${pendingCheck.instructionTx}`} target="_blank" rel="noreferrer">View submitted check</a>
                </div>
              )}
            </section>
          )}

          {account && campaign && checkResult && !paid && (
            <section className="payment-task__body payment-task__body--pay">
              <span className="payment-task__kicker">Ready to pay</span>
              <h2>{formatUnits(checkResult.result.amount, ASSET_DECIMALS)} test FXRP is due.</h2>
              <p>Jorqeth checked <b>{recordReference}</b>. Confirm the exact commission below.</p>
              <div className="payment-amount-row">
                <div><span>Commission due</span><b>{formatUnits(checkResult.result.amount, ASSET_DECIMALS)} FXRP</b></div>
                <div><span>Available</span><b>{formatUnits(availableFunds, ASSET_DECIMALS)} FXRP</b></div>
              </div>
              {shortfall > BigInt(0) && <div className="payment-message payment-message--warning"><b>More funds needed</b><span>Add {formatUnits(shortfall, ASSET_DECIMALS)} test FXRP in the balance panel before paying.</span></div>}
              <button className="btn btn--primary" onClick={payCommission} disabled={busy === "pay" || shortfall > BigInt(0)}>
                {busy === "pay" ? "Paying…" : `Pay ${formatUnits(checkResult.result.amount, ASSET_DECIMALS)} FXRP`}
              </button>
              <button className="payment-text-button" onClick={startNextOrder}>Check a different order</button>
            </section>
          )}

          {account && campaign && paid && (
            <section className="payment-task__body payment-task__body--success">
              <span className="payment-success-mark">✓</span>
              <span className="payment-task__kicker">Payment complete</span>
              <h2>This order was paid.</h2>
              <p>{checkResult ? `${formatUnits(checkResult.result.amount, ASSET_DECIMALS)} test FXRP was sent for ${recordReference}.` : "The commission was sent successfully."}</p>
              <div className="payment-actions">
                <button className="btn btn--primary" onClick={startNextOrder}>Pay another order</button>
                {paymentHash && <a className="btn btn--tinted" href={`${EXPLORER}/tx/${paymentHash}`} target="_blank" rel="noreferrer">View payment</a>}
              </div>
            </section>
          )}
        </main>

        <aside className="payment-sidebar">
          <section className="payment-balance-card">
            <div className="payment-card-head">
              <div><span>Payment balance</span><b>{campaign ? `${formatUnits(availableFunds, ASSET_DECIMALS)} FXRP` : `${formatUnits(walletFxrp, ASSET_DECIMALS)} FXRP`}</b></div>
              <span className="payment-card-badge">Test</span>
            </div>
            {campaign ? (
              <>
                <div className="payment-balance-meta">
                  <div><span>Your wallet</span><b>{formatUnits(walletFxrp, ASSET_DECIMALS)} FXRP</b></div>
                  <div><span>Paid from this payment</span><b>{formatUnits(totalPaid, ASSET_DECIMALS)} FXRP</b></div>
                </div>
                <div className="payment-fund-box">
                  <label className="field field--short"><span>Add funds</span><div className="field__unit"><input inputMode="decimal" value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} /><span>FXRP</span></div></label>
                  <button className="btn btn--primary" onClick={addFunds} disabled={busy === "fund"}>
                    {busy === "fund" ? "Adding funds…" : "Add FXRP"}
                  </button>
                  <a className="payment-small-link" href={FLARE_COSTON2_FAUCET_URL} target="_blank" rel="noreferrer">Get free test FXRP</a>
                </div>
              </>
            ) : (
              <p className="payment-card-copy">Connect your wallet and create the payment first. You can fund it immediately after.</p>
            )}
          </section>

          <section className="payment-summary-card">
            <span className="payment-summary-card__label">Payment terms</span>
            <div className="payment-summary-row"><span>Recipient</span><b>{recipient ? `${recipient.slice(0, 7)}…${recipient.slice(-5)}` : "Not set"}</b></div>
            <div className="payment-summary-row"><span>Commission</span><b>{commissionPercent || "0"}%</b></div>
            <div className="payment-summary-row"><span>Network</span><b>Flare testnet</b></div>
            {account && <div className="payment-summary-row"><span>Funding wallet</span><b>{account.slice(0, 7)}…{account.slice(-5)}</b></div>}
          </section>

          {!campaign && (
            <section className="payment-help-card">
              <span>What happens next</span>
              <ol>
                <li><b>Set the terms.</b> Choose the recipient and rate.</li>
                <li><b>Check an order.</b> Jorqeth checks the agreed record privately.</li>
                <li><b>Pay exactly.</b> You confirm only the amount that is due.</li>
              </ol>
            </section>
          )}
        </aside>
      </div>

      {campaign && (
        <footer className="payment-console__foot">
          <div><b>Want a completely new payment?</b><span>This keeps everything already recorded on Flare unchanged.</span></div>
          <button className="payment-text-button" onClick={startOver}>Start a new payment</button>
        </footer>
      )}
    </div>
  );
}
