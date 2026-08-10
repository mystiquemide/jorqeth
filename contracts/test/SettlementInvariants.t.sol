// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {JorqethTestBase} from "./JorqethTestBase.sol";
import {PayableResult} from "../src/JorqethTypes.sol";
import {JorqethSettlement} from "../src/JorqethSettlement.sol";
import {SignatureResultVerifier} from "../src/SignatureResultVerifier.sol";
import {RevertingToken} from "./mocks/RevertingToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Settlement invariant suite
/// @notice Covers funding, escrow accounting, mutation cases, fail-closed transfer
///         behaviour, and withdrawal beyond the frozen golden vectors. These prove
///         escrow safety and correctness properties the vectors assume.
contract SettlementInvariantsTest is JorqethTestBase {
    // --- Funding rules (BR-001) ---

    function test_fund_onlyMerchant() public {
        token.mint(creator, 1_000000);
        vm.startPrank(creator);
        token.approve(address(settlement), 1_000000);
        vm.expectRevert(JorqethSettlement.NotMerchant.selector);
        settlement.fund(1_000000);
        vm.stopPrank();
    }

    function test_fund_rejectsZero() public {
        vm.prank(merchant);
        vm.expectRevert(JorqethSettlement.ZeroFunding.selector);
        settlement.fund(0);
    }

    function test_setup_escrowIsFunded() public view {
        assertEq(settlement.escrowBalance(), ESCROW_AMOUNT, "escrow funded in setUp");
        assertEq(token.balanceOf(address(settlement)), ESCROW_AMOUNT, "token held by contract");
    }

    // --- Insufficient escrow ---

    function test_insufficientEscrow_reverts() public {
        // Drain escrow to below the commission via merchant withdrawal.
        vm.prank(merchant);
        settlement.withdrawEscrow(ESCROW_AMOUNT - (COMMISSION_A - 1)); // leaves COMMISSION_A - 1

        PayableResult memory r = eligibleResultA();
        bytes memory proof = sign(r);

        uint256 creatorBefore = token.balanceOf(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                JorqethSettlement.InsufficientEscrow.selector, COMMISSION_A, COMMISSION_A - 1
            )
        );
        settlement.settle(r, proof);
        assertEq(token.balanceOf(creator), creatorBefore, "no partial payout");
        assertFalse(settlement.isSettled(ORDER_A), "digest not consumed on failed settle");
    }

    // --- Wrong static bindings ---

    function test_wrongSchema_reverts() public {
        PayableResult memory r = eligibleResultA();
        r.schemaVersion = 2;
        bytes memory proof = sign(r);
        vm.expectRevert(
            abi.encodeWithSelector(
                JorqethSettlement.WrongSchema.selector, uint16(2), SCHEMA_VERSION
            )
        );
        settlement.settle(r, proof);
    }

    function test_wrongCampaign_reverts() public {
        PayableResult memory r = eligibleResultA();
        r.campaignId = keccak256("OTHER");
        bytes memory proof = sign(r);
        vm.expectRevert(
            abi.encodeWithSelector(
                JorqethSettlement.WrongCampaign.selector, keccak256("OTHER"), CAMPAIGN_ID
            )
        );
        settlement.settle(r, proof);
    }

    function test_wrongRuleVersion_reverts() public {
        PayableResult memory r = eligibleResultA();
        r.ruleVersion = keccak256("RULE2");
        bytes memory proof = sign(r);
        vm.expectRevert(
            abi.encodeWithSelector(
                JorqethSettlement.WrongRuleVersion.selector, keccak256("RULE2"), RULE_VERSION
            )
        );
        settlement.settle(r, proof);
    }

    function test_notYetIssued_reverts() public {
        PayableResult memory r = eligibleResultA();
        r.issuedAt = uint64(block.timestamp + 100);
        r.expiry = uint64(block.timestamp + 1 hours);
        bytes memory proof = sign(r);
        vm.expectRevert(
            abi.encodeWithSelector(
                JorqethSettlement.NotYetIssued.selector, r.issuedAt, block.timestamp
            )
        );
        settlement.settle(r, proof);
    }

    // --- Ineligible with nonzero amount is malformed ---

    function test_ineligibleWithNonzeroAmount_reverts() public {
        PayableResult memory r = ineligibleResultB();
        r.amount = 1; // ineligible must carry zero
        bytes memory proof = sign(r);
        vm.expectRevert(
            abi.encodeWithSelector(
                JorqethSettlement.AmountNotZeroForIneligible.selector, uint256(1)
            )
        );
        settlement.settle(r, proof);
        assertFalse(settlement.isSettled(ORDER_B), "malformed negative not recorded");
    }

    // --- Fail closed on token transfer failure ---

    function test_transferFailure_failsClosed() public {
        // Rebuild the whole deployment around a token whose transfer can be toggled.
        RevertingToken rvt = new RevertingToken();
        SignatureResultVerifier v = new SignatureResultVerifier(trustedSigner);
        JorqethSettlement s = new JorqethSettlement(
            IERC20(address(rvt)),
            v,
            SCHEMA_VERSION,
            CAMPAIGN_ID,
            merchant,
            creator,
            COMMISSION_BPS,
            RULE_VERSION
        );
        rvt.mint(merchant, ESCROW_AMOUNT);
        vm.startPrank(merchant);
        rvt.approve(address(s), ESCROW_AMOUNT);
        s.fund(ESCROW_AMOUNT);
        vm.stopPrank();

        // Build an eligible result bound to the NEW settlement contract.
        PayableResult memory r = eligibleResultA();
        r.settlementContract = address(s);
        bytes memory proof = sign(r);

        rvt.setFailTransfers(true);
        vm.expectRevert(); // SafeERC20 bubbles the token revert
        s.settle(r, proof);

        // State must be untouched: no digest consumed, escrow intact.
        assertFalse(s.isSettled(ORDER_A), "digest not consumed when transfer reverts");
        assertEq(s.escrowBalance(), ESCROW_AMOUNT, "escrow intact after failed transfer");
        assertEq(rvt.balanceOf(creator), 0, "creator got nothing");
    }

    // --- Withdrawal ---

    function test_withdrawEscrow_onlyMerchant() public {
        vm.prank(creator);
        vm.expectRevert(JorqethSettlement.NotMerchant.selector);
        settlement.withdrawEscrow(1);
    }

    function test_withdrawEscrow_reducesBalance() public {
        uint256 merchantBefore = token.balanceOf(merchant);
        vm.prank(merchant);
        settlement.withdrawEscrow(10_000000);
        assertEq(settlement.escrowBalance(), ESCROW_AMOUNT - 10_000000, "escrow reduced");
        assertEq(
            token.balanceOf(merchant) - merchantBefore, 10_000000, "merchant received withdrawal"
        );
    }

    // --- Positive then negative on the same campaign share escrow correctly ---

    function test_positiveThenNegative_escrowAccounting() public {
        PayableResult memory pos = eligibleResultA();
        settlement.settle(pos, sign(pos));

        PayableResult memory neg = ineligibleResultB();
        settlement.settle(neg, sign(neg));

        assertEq(
            settlement.escrowBalance(), ESCROW_AMOUNT - COMMISSION_A, "only positive reduced escrow"
        );
        assertEq(settlement.totalSettled(), COMMISSION_A, "totalSettled reflects one payout");
        assertEq(token.balanceOf(creator), COMMISSION_A, "creator paid once");
    }
}
