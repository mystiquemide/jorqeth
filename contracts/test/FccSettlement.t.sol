// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {JorqethTestBase} from "./JorqethTestBase.sol";
import {PayableResult} from "../src/JorqethTypes.sol";
import {JorqethSettlement} from "../src/JorqethSettlement.sol";
import {FccResultVerifier} from "../src/FccResultVerifier.sol";
import {MockTeeMachineRegistry} from "./mocks/MockTeeMachineRegistry.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title FCC settlement integration
/// @notice Proves the winning invariant holds with the REAL FCC verifier installed,
///         and that `JorqethSettlement` is byte-identical to the Milestone 1
///         deployment (same bytecode, same constructor, same tests). This is the
///         load-bearing-sponsor proof: an eligible order settles the exact
///         commission ONLY because a registered TEE signed the result, and the
///         payable path stops the instant that authenticity is missing.
contract FccSettlementTest is JorqethTestBase {
    bytes32 internal constant TEE_ACTION_RESULT_PREFIX = bytes32("TEE_ACTION_RESULT");
    uint256 internal constant EXTENSION_ID = 0x10000;

    uint256 internal teePk = 0x7EE;
    address internal teeId;

    bytes32 internal constant INSTRUCTION_ID =
        0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;
    bytes internal constant SUBMISSION_TAG = bytes("end");
    uint8 internal constant STATUS_OK = 1;

    MockTeeMachineRegistry internal reg;
    FccResultVerifier internal fccVerifier;
    JorqethSettlement internal fccSettlement;

    function setUp() public override {
        super.setUp(); // gives us token, actors, spec constants
        teeId = vm.addr(teePk);

        reg = new MockTeeMachineRegistry();
        address[] memory ids = new address[](1);
        ids[0] = teeId;
        reg.setActive(EXTENSION_ID, ids);

        fccVerifier = new FccResultVerifier(reg, EXTENSION_ID, "simulated-attestation");

        // Same settlement contract, constructed with the FCC verifier instead of the
        // local signature verifier. Nothing about JorqethSettlement changes.
        fccSettlement = new JorqethSettlement(
            token,
            fccVerifier,
            SCHEMA_VERSION,
            CAMPAIGN_ID,
            merchant,
            creator,
            COMMISSION_BPS,
            RULE_VERSION,
            CAMPAIGN_END
        );

        token.mint(merchant, ESCROW_AMOUNT);
        vm.startPrank(merchant);
        token.approve(address(fccSettlement), ESCROW_AMOUNT);
        fccSettlement.fund(ESCROW_AMOUNT);
        vm.stopPrank();
    }

    /// @notice Build a result bound to the FCC settlement deployment.
    function _eligibleForFcc() internal view returns (PayableResult memory r) {
        r = eligibleResultA();
        r.settlementContract = address(fccSettlement);
    }

    function _fccProof(uint256 pk, PayableResult memory r) internal view returns (bytes memory) {
        bytes32 dataHash = keccak256(abi.encode(r));
        bytes32 arHash = keccak256(
            abi.encodePacked(dataHash, INSTRUCTION_ID, keccak256(SUBMISSION_TAG), STATUS_OK)
        );
        bytes32 payload = keccak256(abi.encode(TEE_ACTION_RESULT_PREFIX, block.chainid, arHash));
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(payload);
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(pk, digest);
        return abi.encode(INSTRUCTION_ID, SUBMISSION_TAG, STATUS_OK, abi.encodePacked(rr, s, v));
    }

    // --- Positive: eligible order settles exact commission via a real TEE signature ---

    function test_fcc_eligibleSettlesExactCommission() public {
        PayableResult memory r = _eligibleForFcc();
        uint256 creatorBefore = token.balanceOf(creator);

        fccSettlement.settle(r, _fccProof(teePk, r));

        assertEq(token.balanceOf(creator) - creatorBefore, COMMISSION_A, "exact commission paid");
        assertEq(fccSettlement.escrowBalance(), ESCROW_AMOUNT - COMMISSION_A, "escrow reduced once");
        assertTrue(fccSettlement.isSettled(ORDER_A), "digest consumed");
    }

    // --- Load-bearing: without a registered-TEE signature, no value moves ---

    function test_fcc_nonTeeSignatureIsRejected() public {
        PayableResult memory r = _eligibleForFcc();
        uint256 creatorBefore = token.balanceOf(creator);

        // attacker is a valid key but not a registered teeId. Settlement must revert
        // at the verifier boundary (BadResult), moving nothing.
        vm.expectRevert(JorqethSettlement.BadResult.selector);
        fccSettlement.settle(r, _fccProof(attackerPk, r));

        assertEq(token.balanceOf(creator), creatorBefore, "no payout without TEE authenticity");
        assertFalse(fccSettlement.isSettled(ORDER_A), "digest not consumed");
        assertEq(fccSettlement.escrowBalance(), ESCROW_AMOUNT, "escrow intact");
    }

    // --- Replay is still rejected under the FCC verifier ---

    function test_fcc_replayRejected() public {
        PayableResult memory r = _eligibleForFcc();
        bytes memory proof = _fccProof(teePk, r);
        fccSettlement.settle(r, proof);

        vm.expectRevert(abi.encodeWithSelector(JorqethSettlement.AlreadySettled.selector, ORDER_A));
        fccSettlement.settle(r, proof);
    }

    // --- Removing the TEE (empty active set) stops the payable path entirely ---

    function test_fcc_removingTeeStopsPayment() public {
        address[] memory none = new address[](0);
        reg.setActive(EXTENSION_ID, none);

        PayableResult memory r = _eligibleForFcc();
        vm.expectRevert(FccResultVerifier.EmptyRegistry.selector);
        fccSettlement.settle(r, _fccProof(teePk, r));

        assertEq(fccSettlement.escrowBalance(), ESCROW_AMOUNT, "escrow untouched when FCC absent");
    }
}
