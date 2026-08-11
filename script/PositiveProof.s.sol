// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {PayableResult, Eligibility} from "../contracts/src/JorqethTypes.sol";
import {JorqethSettlement} from "../contracts/src/JorqethSettlement.sol";
import {FccResultVerifier} from "../contracts/src/FccResultVerifier.sol";
import {JorqethEvaluator} from "../contracts/src/JorqethEvaluator.sol";
import {MockUSD} from "../contracts/src/MockUSD.sol";
import {MockTeeMachineRegistry} from "../contracts/test/mocks/MockTeeMachineRegistry.sol";
import {SyntheticMerchantSource} from "../contracts/test/SyntheticMerchantSource.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title Positive-proof deployment + settlement
/// @notice Runs the complete successful path as REAL on-chain transactions on a local
///         devnet (chainId 31337, the chain the genuine tee-node vector targets):
///         deploy the invariant-tested settlement with the real FCC verifier installed,
///         fund one campaign, and settle one eligible order signed by a registered TEE
///         machine using the exact frozen FCC ActionResult scheme. Broadcasting this
///         script produces observable transactions, logs, and balance deltas that can
///         be read back over RPC and cross-checked against the golden vector.
///
///         Coston2 was the plan's target chain, but a fully-live, production-attested
///         FCC round trip there remains pending (no funded wallet available to the
///         executor; public Coston2 rejects simulated attestation). This local
///         run stands in for it: same contracts, same verifier scheme, same
///         exact-payout invariant, on the chain the genuine signature was minted for.
///         The signature here is produced with the registered teeId's key via the
///         frozen scheme; that the scheme's bytes match real Flare library code is
///         separately proven by tools/tee-signer + FccRealSignature.t.sol.
contract PositiveProof is Script {
    // --- Frozen spec config (identical to contracts/test/JorqethTestBase.sol) ---
    uint16 internal constant SCHEMA_VERSION = 1;
    bytes32 internal constant CAMPAIGN_ID =
        0xcbd0f075e08709f2fd3f28132cb9496eecfcac785276e84c16b0d8e475b4c99a;
    bytes32 internal constant RULE_VERSION =
        0xa865c645c1901fa821cc0ea91db46d39b4cfe7e81f927863d51387ab8c947a4d;
    bytes32 internal constant ORDER_A =
        0xbe4b0fa03136646a52108527f8dd4873c60796d246fe5dd610ec0d4a2f6a1a45;
    bytes32 internal constant NONCE_A =
        0x2eb12bba2aabbb88533ac6c328a0a0fb0641940ca57c13fb675bf3c4b9f358ef;
    uint16 internal constant COMMISSION_BPS = 1000; // 10%
    uint256 internal constant NET_A = 200_000000; // gross the commission rule applies to
    uint256 internal constant COMMISSION_A = 20_000000; // floor(NET_A * bps / 10_000)
    uint256 internal constant ESCROW_AMOUNT = 100_000000; // 100.000000 mUSD funded
    // Escrow unlock time, beyond every result expiry so a valid in-window result can
    // never be stranded by a merchant withdrawal (REV-003).
    uint64 internal constant CAMPAIGN_END = 2_100_000_000;

    // --- FCC ActionResult envelope (identical to the forge integration tests) ---
    uint256 internal constant EXTENSION_ID = 0x10000;
    bytes32 internal constant INSTRUCTION_ID =
        0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;
    bytes internal constant SUBMISSION_TAG = bytes("end");
    uint8 internal constant STATUS_OK = 1;
    bytes32 internal constant TEE_ACTION_RESULT_PREFIX = bytes32("TEE_ACTION_RESULT");

    // Anvil account 1: the payout recipient. Distinct from the deployer/merchant.
    address internal constant CREATOR = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    // The registered TEE machine's signing key. Its address IS the teeId (mirrors
    // FccSettlement.t.sol). A distinct key from the deployer/merchant so the payout
    // provably depends on TEE authenticity, not on who sent the transaction.
    uint256 internal constant TEE_PK = 0x7EE;

    function run() external {
        JorqethSettlement settlement = _deployFundSettle();
        _emitAddresses(settlement);
        _emitAmounts(settlement);
    }

    /// @dev Deploy the full stack, fund escrow, and settle one eligible order as real
    ///      broadcast transactions. Reverts unless the exact-payout invariant holds.
    function _deployFundSettle() internal returns (JorqethSettlement settlement) {
        address merchant = msg.sender; // funder; must equal the broadcaster to call fund()
        address teeId = vm.addr(TEE_PK);

        vm.startBroadcast();

        MockUSD token = new MockUSD();
        MockTeeMachineRegistry reg = new MockTeeMachineRegistry();
        FccResultVerifier fcc = new FccResultVerifier(reg, EXTENSION_ID, "simulated-attestation");
        settlement = new JorqethSettlement(
            token,
            fcc,
            SCHEMA_VERSION,
            CAMPAIGN_ID,
            merchant,
            CREATOR,
            COMMISSION_BPS,
            RULE_VERSION,
            CAMPAIGN_END
        );

        address[] memory ids = new address[](1);
        ids[0] = teeId;
        reg.setActive(EXTENSION_ID, ids);

        token.mint(merchant, ESCROW_AMOUNT);
        token.approve(address(settlement), ESCROW_AMOUNT);
        settlement.fund(ESCROW_AMOUNT);

        // Escrow must visibly hold funds and the creator must be empty before settling.
        require(settlement.escrowBalance() == ESCROW_AMOUNT, "escrow not funded before settle");
        require(token.balanceOf(CREATOR) == 0, "creator not empty before settle");

        PayableResult memory r = _buildResult(address(settlement));
        settlement.settle(r, _teeProof(r));

        vm.stopBroadcast();

        _assertExactPayout(settlement, token);
    }

    /// @dev The four independent amounts must agree exactly (acceptance criterion 2).
    function _assertExactPayout(JorqethSettlement settlement, MockUSD token) internal view {
        uint256 formula = (NET_A * COMMISSION_BPS) / 10_000; // configured commission rule
        require(formula == COMMISSION_A, "formula != golden commission");
        require(token.balanceOf(CREATOR) == COMMISSION_A, "creator delta != commission");
        require(
            settlement.escrowBalance() == ESCROW_AMOUNT - COMMISSION_A, "escrow delta != commission"
        );
        require(settlement.totalSettled() == COMMISSION_A, "totalSettled != commission");
        require(settlement.isSettled(ORDER_A), "order digest not consumed");
    }

    function _buildResult(address settlementAddr) internal view returns (PayableResult memory r) {
        // Derive the settled result from the synthetic merchant record instead of
        // asserting it from constants. SyntheticMerchantSource stands in for the
        // merchant's private order feed; JorqethEvaluator reproduces the confidential
        // settlement rule a Flare Compute Extension runs in production. The eligibility
        // code and payable amount are the evaluator's OUTPUT, so this proof settles a
        // computed result, not one fabricated field-by-field in the script.
        JorqethEvaluator.MerchantRecord memory rec = SyntheticMerchantSource.record("ORDER-A");
        uint16 bps = SyntheticMerchantSource.commissionBps();
        require(bps == COMMISSION_BPS, "spec commissionBps != configured campaign");

        r = JorqethEvaluator.toResult(
            rec,
            SCHEMA_VERSION,
            CAMPAIGN_ID,
            CREATOR,
            bps,
            block.chainid,
            settlementAddr,
            RULE_VERSION,
            NONCE_A,
            1,
            2_000_000_000
        );

        // Cross-check the derived output against the spec's own frozen golden reference,
        // so any drift between the evaluator and the golden vector fails the proof here.
        (uint8 goldenCode, uint256 goldenAmount) = SyntheticMerchantSource.expected("ORDER-A");
        require(r.orderDigest == ORDER_A, "record digest != golden ORDER_A");
        require(r.eligibilityCode == goldenCode, "derived code != golden");
        require(r.amount == goldenAmount, "derived amount != golden");
        require(r.eligibilityCode == Eligibility.ELIGIBLE, "eligible order not derived eligible");
        require(r.amount == COMMISSION_A, "derived amount != configured commission");
    }

    /// @dev Reconstruct the exact TEE-signed digest (frozen FCC scheme) and sign it with
    ///      the registered teeId's key. vm.sign yields v in {27,28}, matching OZ ECDSA.
    ///      This script only runs on chainId 31337, so r.chainId == block.chainid and the
    ///      payload here equals the one the verifier rebuilds with block.chainid.
    function _teeProof(PayableResult memory r) internal view returns (bytes memory) {
        bytes32 dataHash = keccak256(abi.encode(r));
        bytes32 arHash = keccak256(
            abi.encodePacked(dataHash, INSTRUCTION_ID, keccak256(SUBMISSION_TAG), STATUS_OK)
        );
        bytes32 payload = keccak256(abi.encode(TEE_ACTION_RESULT_PREFIX, r.chainId, arHash));
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(payload);
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(TEE_PK, digest);
        return abi.encode(INSTRUCTION_ID, SUBMISSION_TAG, STATUS_OK, abi.encodePacked(rr, s, v));
    }

    // --- Machine-parseable evidence (consumed by evidence/run-positive-proof.sh) ---

    function _emitAddresses(JorqethSettlement settlement) internal view {
        FccResultVerifier fcc = FccResultVerifier(address(settlement.verifier()));
        console2.log("JORQETH_EVIDENCE_BEGIN");
        console2.log("chainId", block.chainid);
        console2.log("token", address(settlement.token()));
        console2.log("registry", address(fcc.registry()));
        console2.log("verifier", address(fcc));
        console2.log("settlement", address(settlement));
        console2.log("merchant", settlement.merchant());
        console2.log("creator", settlement.creator());
        console2.log("teeId", vm.addr(TEE_PK));
        console2.log("extensionId", fcc.extensionId());
        console2.log("verifierMode", fcc.mode());
        console2.log("instructionId", vm.toString(INSTRUCTION_ID));
        console2.log("orderDigest", vm.toString(ORDER_A));
    }

    function _emitAmounts(JorqethSettlement settlement) internal view {
        console2.log("escrowBefore", ESCROW_AMOUNT);
        console2.log("creatorBefore", uint256(0));
        console2.log("escrowAfter", settlement.escrowBalance());
        console2.log("creatorAfter", IERC20(settlement.token()).balanceOf(settlement.creator()));
        console2.log("configuredFormula", (NET_A * COMMISSION_BPS) / 10_000);
        console2.log("resultAmount", COMMISSION_A);
        console2.log("commissionBps", uint256(COMMISSION_BPS));
        console2.log("netApplied", NET_A);
        console2.log("totalSettled", settlement.totalSettled());
        console2.log("JORQETH_EVIDENCE_END");
    }
}
