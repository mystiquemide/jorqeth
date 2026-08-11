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
import {NegativeProbe} from "../contracts/test/probes/NegativeProbe.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title Negative and failure proofs
/// @notice The mirror of PositiveProof: deploy the same funded campaign with the real
///         FCC verifier installed, then deliberately attempt to violate the settlement
///         invariant from every angle and prove enforcement as REAL on-chain state:
///         a refunded record settles zero (terminal), replay/wrong-domain/malformed/
///         tampered/expired/infra-unknown/fleet-timeout attempts all pay nothing, and
///         exactly one path (the approved eligible order) moves value. Runs on a local
///         devnet (chainId 31337) for the same reason PositiveProof does.
///
///         Every attempt runs against the LIVE settlement via NegativeProbe.runAll,
///         which try/catches each settle so one transaction records the whole matrix.
///         The persisted on-chain balances then confirm, independently over RPC, that
///         only the single eligible payout transferred value.
contract NegativeProof is Script {
    // --- Frozen spec config (identical to contracts/test/JorqethTestBase.sol) ---
    uint16 internal constant SCHEMA_VERSION = 1;
    bytes32 internal constant CAMPAIGN_ID =
        0xcbd0f075e08709f2fd3f28132cb9496eecfcac785276e84c16b0d8e475b4c99a;
    bytes32 internal constant RULE_VERSION =
        0xa865c645c1901fa821cc0ea91db46d39b4cfe7e81f927863d51387ab8c947a4d;
    uint16 internal constant COMMISSION_BPS = 1000; // 10%
    uint256 internal constant NET_A = 200_000000;
    uint256 internal constant COMMISSION_A = 20_000000; // floor(NET_A * bps / 10_000)
    uint256 internal constant ESCROW_AMOUNT = 100_000000; // 100.000000 mUSD funded
    // Escrow unlock time, beyond every result expiry so a valid in-window result can
    // never be stranded by a merchant withdrawal (REV-003).
    uint64 internal constant CAMPAIGN_END = 2_100_000_000;

    bytes32 internal constant ORDER_A =
        0xbe4b0fa03136646a52108527f8dd4873c60796d246fe5dd610ec0d4a2f6a1a45; // eligible payout
    bytes32 internal constant ORDER_B =
        0x2211acb1c6f286f7f78d0540520ff45e6b53701156d05e1951bb85bbfefff065; // refunded (zero)
    bytes32 internal constant ORDER_C =
        0x5739f03e7db113339cc4be123cbb055d3dcb549923fd291f390ef6e9bfd7b9c3; // infra-unknown
    bytes32 internal constant ORDER_E =
        0xa50c050e20eaf35d43a38130274dd209c67055cc7918d0f537af12b9731c7a9e; // fleet-timeout
    bytes32 internal constant ORDER_F =
        0xe6cd69d332b9696ce3fd14f3beeb1ddc4f1cb9d0b1d63a0b3e793e3ed1293af1; // error-status

    bytes32 internal constant NONCE_A =
        0x2eb12bba2aabbb88533ac6c328a0a0fb0641940ca57c13fb675bf3c4b9f358ef;
    bytes32 internal constant NONCE_B =
        0x351b4fa63e15d300c8b5cb1298987b117fb461c8a427f5a9c2a63678d8013e0b;
    bytes32 internal constant NONCE_C =
        0xe40456bb79e47a47b96f66e84b3f298161d17c2db0661f300a6270b29315c6cd;
    bytes32 internal constant NONCE_E =
        0x856832afd3a2066462abd125b3d4fb15f8c1919227c5b9a0fe3320ad5691035e;
    bytes32 internal constant NONCE_F =
        0x5b3404396096fce10bd1683c942e9e117229a0560a5bd527ec9f40095d0a793a;

    // --- FCC ActionResult envelope (identical to PositiveProof / the forge tests) ---
    uint256 internal constant EXTENSION_ID = 0x10000;
    bytes32 internal constant INSTRUCTION_ID =
        0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;
    bytes internal constant SUBMISSION_TAG = bytes("end");
    uint8 internal constant STATUS_OK = 1; // tee-node success
    uint8 internal constant STATUS_ERROR = 0; // tee-node errorResult / Invalid
    bytes32 internal constant TEE_ACTION_RESULT_PREFIX = bytes32("TEE_ACTION_RESULT");

    address internal constant CREATOR = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8; // payee (anvil #1)
    address internal constant FOREIGN_CONTRACT = address(0xF0F0); // a settlement Jorqeth did not deploy

    uint256 internal constant TEE_PK = 0x7EE; // registered teeId's key (address == teeId)
    uint256 internal constant ATTACKER_PK = 0xBAD; // an unregistered key

    uint256 internal constant N = 11; // in-probe vectors

    // Deployment + result matrices live in storage so run() stays shallow (avoids
    // "stack too deep"); a script instance is single-use so this is safe.
    JorqethSettlement internal settlement;
    MockUSD internal token;
    MockTeeMachineRegistry internal reg;
    NegativeProbe internal probe;

    bool[] internal paid;
    bytes4[] internal sels;
    uint256[] internal cds; // creator deltas
    uint256[] internal eds; // escrow deltas

    bool internal timeoutPaid;
    bytes4 internal timeoutSel;
    uint256 internal timeoutCd;
    uint256 internal timeoutEd;

    // Evaluator output derived from the synthetic merchant record source (set by
    // _derive()). The one paying vector and the terminal refund vector settle these
    // instead of hardcoded amount/code, so the matrix moves computed value, not
    // fabricated value.
    uint8 internal eligibleCode;
    uint256 internal eligibleAmount;
    uint8 internal refundCode;
    uint256 internal refundAmount;

    function run() external {
        _derive();
        _deployRegisterFund();
        _runMatrix1();
        _runTimeout();
        _assertInvariant();
        _emit();
    }

    /// @dev Derive the eligible and refund outcomes from the synthetic record source via
    ///      the evaluator, the same record -> rule -> result path PositiveProof uses.
    ///      Cross-checked against the spec's frozen golden reference so evaluator drift
    ///      fails the proof before any settlement is attempted.
    function _derive() internal {
        uint16 bps = SyntheticMerchantSource.commissionBps();
        require(bps == COMMISSION_BPS, "spec commissionBps != configured campaign");

        JorqethEvaluator.MerchantRecord memory a = SyntheticMerchantSource.record("ORDER-A");
        require(a.orderDigest == ORDER_A, "record digest != golden ORDER_A");
        (eligibleCode, eligibleAmount) = JorqethEvaluator.evaluate(a, bps);
        (uint8 gCodeA, uint256 gAmtA) = SyntheticMerchantSource.expected("ORDER-A");
        require(eligibleCode == gCodeA && eligibleAmount == gAmtA, "eligible derive != golden");
        require(
            eligibleCode == Eligibility.ELIGIBLE && eligibleAmount == COMMISSION_A,
            "eligible != configured commission"
        );

        JorqethEvaluator.MerchantRecord memory b = SyntheticMerchantSource.record("ORDER-B");
        require(b.orderDigest == ORDER_B, "record digest != golden ORDER_B");
        (refundCode, refundAmount) = JorqethEvaluator.evaluate(b, bps);
        (uint8 gCodeB, uint256 gAmtB) = SyntheticMerchantSource.expected("ORDER-B");
        require(refundCode == gCodeB && refundAmount == gAmtB, "refund derive != golden");
        require(
            refundCode == Eligibility.INELIGIBLE && refundAmount == 0, "refund != terminal-zero"
        );
    }

    // --- deploy / register / fund (all real broadcast transactions) ---
    function _deployRegisterFund() internal {
        address merchant = msg.sender; // funder == broadcaster (fund() checks this)

        vm.startBroadcast();
        token = new MockUSD();
        reg = new MockTeeMachineRegistry();
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
        ids[0] = vm.addr(TEE_PK);
        reg.setActive(EXTENSION_ID, ids);

        token.mint(merchant, ESCROW_AMOUNT);
        token.approve(address(settlement), ESCROW_AMOUNT);
        settlement.fund(ESCROW_AMOUNT);

        probe = new NegativeProbe();
        vm.stopBroadcast();

        require(settlement.escrowBalance() == ESCROW_AMOUNT, "escrow not funded");
        require(token.balanceOf(CREATOR) == 0, "creator not empty before proof");
    }

    // Matrix 1: every attempt against the live funded campaign, one transaction.
    function _runMatrix1() internal {
        (PayableResult[] memory rs, bytes[] memory proofs) = _buildVectors(address(settlement));
        vm.broadcast();
        (paid, sels, cds, eds) =
            probe.runAll(settlement, IERC20(address(token)), CREATOR, rs, proofs);
    }

    // Matrix 2: force a TEE-fleet outage (empty active set) and prove a well-formed
    // eligible result can no longer pay (infrastructure unknown, distinct from a
    // legitimate business negative).
    function _runTimeout() internal {
        vm.startBroadcast();
        reg.setActive(EXTENSION_ID, new address[](0)); // fleet outage: no active TEE machine
        vm.stopBroadcast();

        PayableResult memory r = _eligible(ORDER_E, NONCE_E, address(settlement));
        bytes[] memory proofs = new bytes[](1);
        proofs[0] = _proof(TEE_PK, r);
        PayableResult[] memory rs = new PayableResult[](1);
        rs[0] = r;

        vm.broadcast();
        (bool[] memory p, bytes4[] memory s, uint256[] memory c, uint256[] memory e) =
            probe.runAll(settlement, IERC20(address(token)), CREATOR, rs, proofs);
        timeoutPaid = p[0];
        timeoutSel = s[0];
        timeoutCd = c[0];
        timeoutEd = e[0];
    }

    // --- vector construction ---
    // Well-formed eligible result for `order`, bound to this deployment and a valid
    // window. `amount` and `eligibilityCode` are the evaluator's derived output for the
    // eligible ORDER-A record (see _derive), not hardcoded, so every eligible-shaped
    // vector starts from a computed result before any deliberate tamper is applied.
    function _eligible(bytes32 order, bytes32 nonce, address settlementAddr)
        internal
        view
        returns (PayableResult memory r)
    {
        r = PayableResult({
            schemaVersion: SCHEMA_VERSION,
            campaignId: CAMPAIGN_ID,
            orderDigest: order,
            creator: CREATOR,
            amount: eligibleAmount,
            eligibilityCode: eligibleCode,
            chainId: block.chainid,
            settlementContract: settlementAddr,
            ruleVersion: RULE_VERSION,
            nonce: nonce,
            issuedAt: 1,
            expiry: 2_000_000_000
        });
    }

    function _buildVectors(address s)
        internal
        view
        returns (PayableResult[] memory rs, bytes[] memory proofs)
    {
        rs = new PayableResult[](N);
        proofs = new bytes[](N);

        // 0: legitimate business negative (refund). Terminal, pays zero, marks settled.
        //    Derived from the ORDER-B synthetic record: class "refunded" -> INELIGIBLE, 0.
        PayableResult memory r0 = _eligible(ORDER_B, NONCE_B, s);
        r0.amount = refundAmount;
        r0.eligibilityCode = refundCode;
        rs[0] = r0;
        proofs[0] = _proof(TEE_PK, r0);

        // 1: wrong domain (chain). Signed for a foreign chain; static check fires first.
        PayableResult memory r1 = _eligible(ORDER_A, NONCE_A, s);
        r1.chainId = block.chainid + 1;
        rs[1] = r1;
        proofs[1] = _proof(TEE_PK, r1);

        // 2: wrong domain (contract). Bound to a foreign settlement contract.
        PayableResult memory r2 = _eligible(ORDER_A, NONCE_A, FOREIGN_CONTRACT);
        rs[2] = r2;
        proofs[2] = _proof(TEE_PK, r2);

        // 3: malformed authenticity -- signed by an unregistered (attacker) key.
        PayableResult memory r3 = _eligible(ORDER_A, NONCE_A, s);
        rs[3] = r3;
        proofs[3] = _proof(ATTACKER_PK, r3);

        // 4: tampered amount -- honest signature, amount inflated AFTER signing.
        PayableResult memory r4 = _eligible(ORDER_A, NONCE_A, s);
        proofs[4] = _proof(TEE_PK, r4);
        r4.amount = COMMISSION_A * 2;
        rs[4] = r4;

        // 5: tampered recipient -- honest signature, creator swapped AFTER signing.
        PayableResult memory r5 = _eligible(ORDER_A, NONCE_A, s);
        proofs[5] = _proof(TEE_PK, r5);
        r5.creator = vm.addr(ATTACKER_PK);
        rs[5] = r5;

        // 6: expired result -- validity window already closed.
        PayableResult memory r6 = _eligible(ORDER_A, NONCE_A, s);
        r6.issuedAt = 1;
        r6.expiry = 2; // <= block.timestamp
        rs[6] = r6;
        proofs[6] = _proof(TEE_PK, r6);

        // 7: infrastructure unknown -- a result carrying INFRASTRUCTURE_UNKNOWN (code 2)
        //    must never pay and must NOT consume the digest (retryable). A correct
        //    evaluator never signs code 2 for a known order class, so this injects it
        //    deliberately to prove the contract fails closed on it regardless. Reusing
        //    ORDER_C's digest keeps the vector on its own non-colliding order.
        PayableResult memory r7 = _eligible(ORDER_C, NONCE_C, s);
        r7.amount = 0;
        r7.eligibilityCode = Eligibility.INFRASTRUCTURE_UNKNOWN;
        rs[7] = r7;
        proofs[7] = _proof(TEE_PK, r7);

        // 8: the ONE approved positive path -- eligible order pays the exact commission.
        PayableResult memory r8 = _eligible(ORDER_A, NONCE_A, s);
        rs[8] = r8;
        proofs[8] = _proof(TEE_PK, r8);

        // 9: replay of the just-paid eligible order -- cannot pay twice (runs after 8).
        rs[9] = _eligible(ORDER_A, NONCE_A, s);
        proofs[9] = _proof(TEE_PK, rs[9]);

        // 10: genuine TEE signature but a non-OK ActionResult status (error, tee-node
        //     status 0). The Data still decodes to a fully payable eligible outcome and
        //     the signature is authentic (registered teeId), yet the TEE reported failure.
        //     Must never pay, and must NOT consume the digest (retryable like a timeout).
        //     This is the on-chain counterpart to FccResultVerifier's status gate.
        PayableResult memory r10 = _eligible(ORDER_F, NONCE_F, s);
        rs[10] = r10;
        proofs[10] = _proofStatus(TEE_PK, r10, STATUS_ERROR);
    }

    /// @dev Frozen FCC ActionResult scheme, signed by `pk` over `status`. The status
    ///      is folded into arHash (as tee-node does), so a signature is bound to it and
    ///      cannot be swapped after signing. vm.sign yields v in {27,28}.
    function _proofStatus(uint256 pk, PayableResult memory r, uint8 status)
        internal
        pure
        returns (bytes memory)
    {
        bytes32 dataHash = keccak256(abi.encode(r));
        bytes32 arHash = keccak256(
            abi.encodePacked(dataHash, INSTRUCTION_ID, keccak256(SUBMISSION_TAG), status)
        );
        bytes32 payload = keccak256(abi.encode(TEE_ACTION_RESULT_PREFIX, r.chainId, arHash));
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(payload);
        (uint8 v, bytes32 rr, bytes32 sc) = vm.sign(pk, digest);
        return abi.encode(INSTRUCTION_ID, SUBMISSION_TAG, status, abi.encodePacked(rr, sc, v));
    }

    /// @dev The common case: a genuine success-status (STATUS_OK) proof.
    function _proof(uint256 pk, PayableResult memory r) internal pure returns (bytes memory) {
        return _proofStatus(pk, r, STATUS_OK);
    }

    // --- the settlement invariant, asserted on persisted state ---
    function _assertInvariant() internal view {
        // Exactly one path moved value, and it moved exactly the commission.
        uint256 payingPaths;
        for (uint256 i; i < paid.length; i++) {
            if (cds[i] != 0) payingPaths++;
        }
        require(payingPaths == 1, "more than one path transferred value");
        require(paid[8] && cds[8] == COMMISSION_A, "eligible path did not pay exact commission");
        require(!timeoutPaid && timeoutCd == 0, "fleet-outage path transferred value");

        require(token.balanceOf(CREATOR) == COMMISSION_A, "creator != exact commission");
        require(
            settlement.escrowBalance() == ESCROW_AMOUNT - COMMISSION_A,
            "escrow != funded - commission"
        );
        require(settlement.totalSettled() == COMMISSION_A, "totalSettled != commission");

        // Distinguishability: a refund is terminal (settled), infra-unknown is retryable.
        require(settlement.isSettled(ORDER_A), "eligible order not consumed");
        require(settlement.isSettled(ORDER_B), "refund not terminal (should be settled)");
        require(!settlement.isSettled(ORDER_C), "infra-unknown wrongly consumed digest");
        require(
            !settlement.isSettled(ORDER_E),
            "fleet-outage wrongly consumed digest (must stay retryable)"
        );
        require(
            !settlement.isSettled(ORDER_F),
            "error-status wrongly consumed digest (must stay retryable)"
        );
    }

    // --- machine-parseable evidence (consumed by evidence/run-negative-proof.sh) ---
    function _emit() internal view {
        FccResultVerifier fcc = FccResultVerifier(address(settlement.verifier()));
        console2.log("JORQETH_EVIDENCE_BEGIN");
        console2.log("chainId", block.chainid);
        console2.log("token", address(token));
        console2.log("registry", address(reg));
        console2.log("verifier", address(fcc));
        console2.log("settlement", address(settlement));
        console2.log("creator", settlement.creator());
        console2.log("teeId", vm.addr(TEE_PK));
        console2.log("extensionId", fcc.extensionId());
        console2.log("verifierMode", fcc.mode());
        console2.log("vectorCount", paid.length);
        for (uint256 i; i < paid.length; i++) {
            string memory p = string.concat("v", vm.toString(i));
            console2.log(string.concat(p, "_paid"), paid[i] ? "true" : "false");
            console2.log(string.concat(p, "_sel"), vm.toString(abi.encodePacked(sels[i])));
            console2.log(string.concat(p, "_creatorDelta"), cds[i]);
            console2.log(string.concat(p, "_escrowDelta"), eds[i]);
        }
        console2.log("timeout_paid", timeoutPaid ? "true" : "false");
        console2.log("timeout_sel", vm.toString(abi.encodePacked(timeoutSel)));
        console2.log("timeout_creatorDelta", timeoutCd);
        console2.log("timeout_escrowDelta", timeoutEd);
        console2.log("isSettled_A", settlement.isSettled(ORDER_A) ? "true" : "false");
        console2.log("isSettled_B", settlement.isSettled(ORDER_B) ? "true" : "false");
        console2.log("isSettled_C", settlement.isSettled(ORDER_C) ? "true" : "false");
        console2.log("isSettled_E", settlement.isSettled(ORDER_E) ? "true" : "false");
        console2.log("isSettled_F", settlement.isSettled(ORDER_F) ? "true" : "false");
        console2.log("escrowFinal", settlement.escrowBalance());
        console2.log("creatorFinal", token.balanceOf(CREATOR));
        console2.log("totalSettled", settlement.totalSettled());
        console2.log("JORQETH_EVIDENCE_END");
    }
}
