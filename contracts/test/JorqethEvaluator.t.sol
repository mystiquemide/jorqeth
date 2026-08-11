// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {JorqethEvaluator} from "../src/JorqethEvaluator.sol";
import {Eligibility, PayableResult} from "../src/JorqethTypes.sol";
import {SyntheticMerchantSource} from "./SyntheticMerchantSource.sol";

/// @title JorqethEvaluator unit tests
/// @notice Proves the local simulated evaluator DERIVES each result field from the
///         synthetic merchant record rather than asserting it, and that its output
///         matches the frozen golden reference in spec/jorqeth-v1.json for every
///         canonical order. Also proves the two properties settlement depends on: only
///         an eligible order earns a nonzero payout, and any record class the evaluator
///         cannot classify fails closed as INFRASTRUCTURE_UNKNOWN (never payable).
contract JorqethEvaluatorTest is Test {
    uint16 internal bps;

    function setUp() public {
        bps = SyntheticMerchantSource.commissionBps();
        assertEq(bps, 1000, "spec commissionBps changed");
    }

    /// @dev Every canonical order in the spec: the evaluator's derived (code, amount)
    ///      must equal the spec's own expected golden values, byte-for-byte.
    function test_derivedOutcomesMatchGolden() public view {
        _assertMatchesGolden("ORDER-A");
        _assertMatchesGolden("ORDER-B");
        _assertMatchesGolden("ORDER-C");
    }

    function _assertMatchesGolden(string memory key) internal view {
        JorqethEvaluator.MerchantRecord memory rec = SyntheticMerchantSource.record(key);
        (uint8 code, uint256 amount) = JorqethEvaluator.evaluate(rec, bps);
        (uint8 goldenCode, uint256 goldenAmount) = SyntheticMerchantSource.expected(key);
        assertEq(code, goldenCode, string.concat(key, ": code != golden"));
        assertEq(amount, goldenAmount, string.concat(key, ": amount != golden"));
    }

    /// @dev The eligible order is the only canonical order that earns a payout, and it
    ///      is the exact floor commission floor(net * bps / 10000).
    function test_eligibleOrderEarnsExactFloorCommission() public view {
        JorqethEvaluator.MerchantRecord memory rec = SyntheticMerchantSource.record("ORDER-A");
        (uint8 code, uint256 amount) = JorqethEvaluator.evaluate(rec, bps);
        assertEq(code, Eligibility.ELIGIBLE, "eligible order not ELIGIBLE");
        assertEq(amount, (rec.netAmount * bps) / 10_000, "amount != floor rule");
        assertEq(amount, 20_000000, "amount != golden 20.000000 mUSD");
    }

    /// @dev A refunded order is a terminal negative: ineligible, pays zero.
    function test_refundedOrderPaysZero() public view {
        JorqethEvaluator.MerchantRecord memory rec = SyntheticMerchantSource.record("ORDER-B");
        (uint8 code, uint256 amount) = JorqethEvaluator.evaluate(rec, bps);
        assertEq(code, Eligibility.INELIGIBLE, "refund not INELIGIBLE");
        assertEq(amount, 0, "refund paid nonzero");
    }

    /// @dev An unmatched order is a terminal negative: ineligible, pays zero.
    function test_unmatchedOrderPaysZero() public view {
        JorqethEvaluator.MerchantRecord memory rec = SyntheticMerchantSource.record("ORDER-C");
        (uint8 code, uint256 amount) = JorqethEvaluator.evaluate(rec, bps);
        assertEq(code, Eligibility.INELIGIBLE, "unmatched not INELIGIBLE");
        assertEq(amount, 0, "unmatched paid nonzero");
    }

    /// @dev Fail-closed: any class the evaluator cannot recognize is
    ///      INFRASTRUCTURE_UNKNOWN with zero amount. This is never a payable outcome, so
    ///      a record the evaluator cannot classify can never move value.
    function test_unknownClassFailsClosed() public pure {
        JorqethEvaluator.MerchantRecord memory rec = JorqethEvaluator.MerchantRecord({
            orderDigest: bytes32(uint256(1)), class: "something-unrecognized", netAmount: 200_000000
        });
        (uint8 code, uint256 amount) = JorqethEvaluator.evaluate(rec, 1000);
        assertEq(code, Eligibility.INFRASTRUCTURE_UNKNOWN, "unknown class not fail-closed");
        assertEq(amount, 0, "unknown class paid nonzero");
    }

    /// @dev toResult wires evaluate() output straight into the domain-bound result, so
    ///      amount + eligibilityCode are the evaluator's output, never the caller's.
    function test_toResultDerivesResultFields() public view {
        JorqethEvaluator.MerchantRecord memory rec = SyntheticMerchantSource.record("ORDER-A");
        PayableResult memory r = JorqethEvaluator.toResult(
            rec,
            1,
            bytes32(uint256(0xCAFE)),
            address(0xC0FFEE),
            bps,
            31337,
            address(0xBEEF),
            bytes32(uint256(0xB0B)),
            bytes32(uint256(0x1234)),
            1,
            2_000_000_000
        );
        (uint8 code, uint256 amount) = JorqethEvaluator.evaluate(rec, bps);
        assertEq(r.eligibilityCode, code, "toResult code != evaluate code");
        assertEq(r.amount, amount, "toResult amount != evaluate amount");
        assertEq(r.orderDigest, rec.orderDigest, "toResult digest != record digest");
    }

    /// @dev The floor rounding direction is truncation toward zero: a net amount that
    ///      does not divide evenly rounds DOWN, never up.
    function test_commissionFloorRoundsDown() public pure {
        // 1999 * 1000 / 10000 = 199.9 -> floor 199
        assertEq(JorqethEvaluator.commission(1999, 1000), 199, "did not floor down");
        assertEq(JorqethEvaluator.commission(0, 1000), 0, "zero net paid nonzero");
    }
}
