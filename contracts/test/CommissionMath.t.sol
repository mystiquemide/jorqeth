// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SignatureResultVerifier} from "../src/SignatureResultVerifier.sol";

/// @title Commission rounding reference
/// @notice Freezes the floor rounding rule commission = floor(net * bps / 10000)
///         as documented in spec/jorqeth-v1.json. The evaluator computes the amount
///         off-chain; this test pins the exact arithmetic the amount must equal so a
///         drifting evaluator is caught against a fixed reference.
contract CommissionMathTest is Test {
    function commission(uint256 net, uint256 bps) internal pure returns (uint256) {
        return (net * bps) / 10000; // floor
    }

    function test_floor_exactMultiple() public pure {
        assertEq(commission(200_000000, 1000), 20_000000);
    }

    function test_floor_truncatesRemainder() public pure {
        // 100000001 * 1000 / 10000 = 10000000.1 -> floor 10000000
        assertEq(commission(100_000001, 1000), 10_000000);
    }

    function test_floor_smallAmountsRoundToZero() public pure {
        // 9 * 1000 / 10000 = 0.9 -> floor 0
        assertEq(commission(9, 1000), 0);
    }

    function test_floor_zeroBpsIsZero() public pure {
        assertEq(commission(200_000000, 0), 0);
    }

    function testFuzz_floor_neverExceedsProportional(uint128 net, uint16 bps) public pure {
        vm.assume(bps <= 10000);
        uint256 c = commission(net, bps);
        // Floor result can never exceed the exact proportional value.
        assertLe(c * 10000, uint256(net) * bps);
        // And is within one unit of it (floor property).
        assertLt(uint256(net) * bps - c * 10000, 10000);
    }
}

contract VerifierModeTest is Test {
    function test_localMode_label() public {
        SignatureResultVerifier v = new SignatureResultVerifier(address(0xBEEF));
        assertEq(
            v.mode(),
            "local-signature-v1",
            "M1 verifier must self-label as local, not production FCC"
        );
    }

    function test_verifier_rejectsZeroSigner() public {
        vm.expectRevert(bytes("verifier: zero signer"));
        new SignatureResultVerifier(address(0));
    }
}
