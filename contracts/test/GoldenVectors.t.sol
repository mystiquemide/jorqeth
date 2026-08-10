// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {JorqethTestBase} from "./JorqethTestBase.sol";
import {PayableResult} from "../src/JorqethTypes.sol";
import {JorqethSettlement} from "../src/JorqethSettlement.sol";

/// @title Golden vector suite
/// @notice One test per frozen vector in spec/jorqeth-v1.json. These freeze the
///         exact positive and zero outcomes and every rejected path, proving the
///         winning invariant: no valid domain-bound eligible result means no
///         payment, and a valid result pays only the bound amount to the bound
///         creator once.
contract GoldenVectorsTest is JorqethTestBase {
    // V1: eligible order pays the exact floor commission once.
    function test_V1_positive_paysExactCommission() public {
        PayableResult memory r = eligibleResultA();
        bytes memory proof = sign(r);

        uint256 creatorBefore = token.balanceOf(creator);
        uint256 escrowBefore = settlement.escrowBalance();

        vm.expectEmit(true, true, true, true, address(settlement));
        emit JorqethSettlement.Settled(CAMPAIGN_ID, ORDER_A, creator, 1, COMMISSION_A);
        settlement.settle(r, proof);

        assertEq(token.balanceOf(creator) - creatorBefore, COMMISSION_A, "exact commission paid");
        assertEq(
            escrowBefore - settlement.escrowBalance(),
            COMMISSION_A,
            "escrow reduced by exact amount"
        );
        assertEq(settlement.totalSettled(), COMMISSION_A, "totalSettled tracks payout");
        assertTrue(settlement.isSettled(ORDER_A), "order A marked settled");
    }

    // V2: refunded order is a valid evaluation that pays zero and is marked settled.
    function test_V2_negative_refund_paysZeroAndSettles() public {
        PayableResult memory r = ineligibleResultB();
        bytes memory proof = sign(r);

        uint256 creatorBefore = token.balanceOf(creator);
        uint256 escrowBefore = settlement.escrowBalance();

        vm.expectEmit(true, true, true, true, address(settlement));
        emit JorqethSettlement.Settled(CAMPAIGN_ID, ORDER_B, creator, 0, 0);
        settlement.settle(r, proof);

        assertEq(token.balanceOf(creator), creatorBefore, "creator balance unchanged");
        assertEq(settlement.escrowBalance(), escrowBefore, "escrow unchanged");
        assertEq(settlement.totalSettled(), 0, "no settlement value");
        assertTrue(settlement.isSettled(ORDER_B), "order B marked settled (terminal negative)");
    }

    // V3: replaying the eligible result cannot pay twice.
    function test_V3_replay_cannotPayTwice() public {
        PayableResult memory r = eligibleResultA();
        bytes memory proof = sign(r);
        settlement.settle(r, proof);

        uint256 creatorAfterFirst = token.balanceOf(creator);
        vm.expectRevert(abi.encodeWithSelector(JorqethSettlement.AlreadySettled.selector, ORDER_A));
        settlement.settle(r, proof);
        assertEq(token.balanceOf(creator), creatorAfterFirst, "no second payout");
    }

    // V4: result bound to a different chain id cannot pay.
    function test_V4_wrongDomain_chain_reverts() public {
        PayableResult memory r = eligibleResultA();
        r.chainId = block.chainid + 1; // sign for a foreign chain
        bytes memory proof = sign(r);

        uint256 creatorBefore = token.balanceOf(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                JorqethSettlement.WrongChain.selector, block.chainid + 1, block.chainid
            )
        );
        settlement.settle(r, proof);
        assertEq(token.balanceOf(creator), creatorBefore, "no payout on wrong chain");
    }

    // V5: result bound to a different settlement contract cannot pay.
    function test_V5_wrongDomain_contract_reverts() public {
        PayableResult memory r = eligibleResultA();
        address foreign = address(0xF0F0);
        r.settlementContract = foreign; // sign for a foreign contract
        bytes memory proof = sign(r);

        uint256 creatorBefore = token.balanceOf(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                JorqethSettlement.WrongContract.selector, foreign, address(settlement)
            )
        );
        settlement.settle(r, proof);
        assertEq(token.balanceOf(creator), creatorBefore, "no payout on wrong contract");
    }

    // V6: expired result cannot pay.
    function test_V6_expired_reverts() public {
        PayableResult memory r = eligibleResultA();
        r.issuedAt = uint64(block.timestamp - 2 hours);
        r.expiry = uint64(block.timestamp - 1 hours); // already expired
        bytes memory proof = sign(r);

        uint256 creatorBefore = token.balanceOf(creator);
        vm.expectRevert(
            abi.encodeWithSelector(JorqethSettlement.Expired.selector, r.expiry, block.timestamp)
        );
        settlement.settle(r, proof);
        assertEq(token.balanceOf(creator), creatorBefore, "no payout when expired");
    }

    // V7: result signed by an untrusted key cannot pay.
    function test_V7_untrustedSigner_reverts() public {
        PayableResult memory r = eligibleResultA();
        bytes memory proof = signWith(attackerPk, r); // attacker signs

        uint256 creatorBefore = token.balanceOf(creator);
        vm.expectRevert(JorqethSettlement.BadResult.selector);
        settlement.settle(r, proof);
        assertEq(token.balanceOf(creator), creatorBefore, "no payout on untrusted signer");
    }

    // V8: tampering the recipient after signing breaks verification.
    function test_V8_tamperedCreator_reverts() public {
        PayableResult memory r = eligibleResultA();
        bytes memory proof = sign(r); // sign the honest result
        r.creator = attackerAddr(); // then tamper recipient

        // The static creator check fires first (defence in depth), still no payout.
        uint256 creatorBefore = token.balanceOf(creator);
        vm.expectRevert(
            abi.encodeWithSelector(JorqethSettlement.WrongCreator.selector, attackerAddr(), creator)
        );
        settlement.settle(r, proof);
        assertEq(token.balanceOf(creator), creatorBefore, "no payout when creator tampered");
    }

    // V9: tampering the amount after signing breaks verification.
    function test_V9_tamperedAmount_reverts() public {
        PayableResult memory r = eligibleResultA();
        bytes memory proof = sign(r); // sign honest amount
        r.amount = COMMISSION_A * 2; // inflate after signing

        uint256 creatorBefore = token.balanceOf(creator);
        // Domain/schema/creator all still match; the signature no longer recovers
        // the trusted signer, so authenticity fails closed.
        vm.expectRevert(JorqethSettlement.BadResult.selector);
        settlement.settle(r, proof);
        assertEq(token.balanceOf(creator), creatorBefore, "no payout when amount tampered");
    }

    // V10: infrastructure-unknown code is never payable and fails closed.
    function test_V10_infraUnknown_reverts() public {
        PayableResult memory r = eligibleResultA();
        r.eligibilityCode = 2; // INFRASTRUCTURE_UNKNOWN
        r.amount = 0;
        bytes memory proof = sign(r);

        uint256 creatorBefore = token.balanceOf(creator);
        vm.expectRevert(abi.encodeWithSelector(JorqethSettlement.NonPayableCode.selector, uint8(2)));
        settlement.settle(r, proof);
        assertEq(token.balanceOf(creator), creatorBefore, "no payout on infra-unknown");
        assertFalse(settlement.isSettled(ORDER_A), "infra-unknown does not consume the digest");
    }

    function attackerAddr() internal view returns (address) {
        return vm.addr(attackerPk);
    }
}
