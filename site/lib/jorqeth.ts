import {
  createPublicClient,
  defineChain,
  http,
  isAddress,
  type Address,
  type Hex,
} from "viem";

export const COSTON2_RPC_URL =
  process.env.NEXT_PUBLIC_COSTON2_RPC_URL ||
  "https://coston2-api.flare.network/ext/C/rpc";

export const COSTON2_FTEST_XRP_ADDRESS =
  "0x0b6A3645c240605887a5532109323A3E12273dc7" as Address;
export const FLARE_COSTON2_FAUCET_URL = "https://faucet.flare.network/";

export const coston2 = defineChain({
  id: 114,
  name: "Flare Testnet Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [COSTON2_RPC_URL] } },
  blockExplorers: {
    default: { name: "Coston2 Explorer", url: "https://coston2-explorer.flare.network" },
  },
  testnet: true,
});

function publicAddress(value: string | undefined): Address | undefined {
  return value && isAddress(value) ? value : undefined;
}

export const deployment = {
  // Legacy MockUSD deployment retained for the disclosed-signer fallback and the
  // historical mUSD proof. The primary FCE app automatically prefers FXRP once
  // an FXRP-bound campaign factory is configured.
  token: publicAddress(process.env.NEXT_PUBLIC_JORQETH_TOKEN_ADDRESS),
  verifier: publicAddress(process.env.NEXT_PUBLIC_JORQETH_VERIFIER_ADDRESS),
  factory: publicAddress(process.env.NEXT_PUBLIC_JORQETH_FACTORY_ADDRESS),
  fceVerifier: publicAddress(process.env.NEXT_PUBLIC_JORQETH_FCE_VERIFIER_ADDRESS),
  fceFactory: publicAddress(process.env.NEXT_PUBLIC_JORQETH_FCE_FACTORY_ADDRESS),
  fceInstructionSender: publicAddress(
    process.env.NEXT_PUBLIC_JORQETH_FCE_INSTRUCTION_SENDER_ADDRESS,
  ),
  fceExtensionId: process.env.NEXT_PUBLIC_JORQETH_FCE_EXTENSION_ID || "66159",
  fxrpToken:
    publicAddress(process.env.NEXT_PUBLIC_JORQETH_FXRP_TOKEN_ADDRESS) ||
    COSTON2_FTEST_XRP_ADDRESS,
  fxrpFactory: publicAddress(process.env.NEXT_PUBLIC_JORQETH_FXRP_FACTORY_ADDRESS),
};

export const deploymentConfigured = Boolean(
  deployment.token && deployment.verifier && deployment.factory,
);

export const fceDeploymentConfigured = Boolean(
  deployment.token &&
    deployment.fceVerifier &&
    deployment.fceFactory &&
    deployment.fceInstructionSender,
);

export const fxrpDeploymentConfigured = Boolean(
  deployment.fxrpToken &&
    deployment.fceVerifier &&
    deployment.fxrpFactory &&
    deployment.fceInstructionSender,
);

export const publicClient = createPublicClient({ chain: coston2, transport: http(COSTON2_RPC_URL) });

export type PayableResult = {
  schemaVersion: number;
  campaignId: Hex;
  orderDigest: Hex;
  creator: Address;
  amount: bigint;
  eligibilityCode: number;
  chainId: bigint;
  settlementContract: Address;
  ruleVersion: Hex;
  nonce: Hex;
  issuedAt: bigint;
  expiry: bigint;
};

export const payableResultTypes = {
  PayableResult: [
    { name: "schemaVersion", type: "uint16" },
    { name: "campaignId", type: "bytes32" },
    { name: "orderDigest", type: "bytes32" },
    { name: "creator", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "eligibilityCode", type: "uint8" },
    { name: "chainId", type: "uint256" },
    { name: "settlementContract", type: "address" },
    { name: "ruleVersion", type: "bytes32" },
    { name: "nonce", type: "bytes32" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiry", type: "uint64" },
  ],
} as const;

export const factoryAbi = [
  {
    type: "function",
    name: "createCampaign",
    stateMutability: "nonpayable",
    inputs: [
      { name: "campaignId", type: "bytes32" },
      { name: "creator", type: "address" },
      { name: "commissionBps", type: "uint16" },
      { name: "ruleVersion", type: "bytes32" },
      { name: "campaignEnd", type: "uint64" },
    ],
    outputs: [{ name: "settlement", type: "address" }],
  },
  {
    type: "function",
    name: "isCampaign",
    stateMutability: "view",
    inputs: [{ name: "settlement", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "CampaignCreated",
    anonymous: false,
    inputs: [
      { name: "settlement", type: "address", indexed: true },
      { name: "campaignId", type: "bytes32", indexed: true },
      { name: "merchant", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: false },
      { name: "commissionBps", type: "uint16", indexed: false },
      { name: "ruleVersion", type: "bytes32", indexed: false },
      { name: "campaignEnd", type: "uint64", indexed: false },
    ],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const mockTokenAbi = [
  ...erc20Abi,
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

// Backward-compatible export for the disclosed-signer demo.
export const tokenAbi = mockTokenAbi;

export const settlementAbi = [
  {
    type: "function",
    name: "fund",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "r",
        type: "tuple",
        components: payableResultTypes.PayableResult,
      },
      { name: "proof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settled",
    stateMutability: "view",
    inputs: [{ name: "orderDigest", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "escrowBalance",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalSettled",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "campaignId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "creator",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "merchant",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "commissionBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "ruleVersion",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "campaignEnd",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }],
  },
  {
    type: "function",
    name: "verifier",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const verifierAbi = [
  {
    type: "function",
    name: "trustedSigner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const fceInstructionSenderAbi = [
  {
    type: "function",
    name: "sendEvaluation",
    stateMutability: "payable",
    inputs: [{ name: "message", type: "bytes" }],
    outputs: [{ name: "instructionId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "extensionId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "EvaluationInstructionSent",
    anonymous: false,
    inputs: [
      { name: "instructionId", type: "bytes32", indexed: true },
      { name: "requester", type: "address", indexed: true },
    ],
  },
] as const;

export const fceVerifierAbi = [
  {
    type: "function",
    name: "verify",
    stateMutability: "view",
    inputs: [
      { name: "result", type: "tuple", components: payableResultTypes.PayableResult },
      { name: "proof", type: "bytes" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "registry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "extensionId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "mode",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

export const activeTeeRegistryAbi = [
  {
    type: "function",
    name: "getActiveTeeMachines",
    stateMutability: "view",
    inputs: [{ name: "extensionId", type: "uint256" }],
    outputs: [
      { name: "teeIds", type: "address[]" },
      { name: "urls", type: "string[]" },
    ],
  },
] as const;
