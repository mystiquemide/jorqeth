// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PayableResult} from "../../src/JorqethTypes.sol";
import {JorqethSettlement} from "../../src/JorqethSettlement.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Negative-proof evidence harness (test/demo only, never production)
/// @notice Attempts each (result, proof) pair against the LIVE settlement and records,
///         per attempt, whether it paid, the revert selector on failure, and the exact
///         creator/escrow deltas. Each attempt is wrapped in try/catch so a reverting
///         attempt rolls back locally while the enclosing call keeps going: one mined
///         transaction therefore captures the whole negative matrix as `AttemptResult`
///         logs, and the two terminal non-paying/paying outcomes that DO change state
///         (a refunded settled-zero and the single eligible payout) persist on-chain.
contract NegativeProbe {
    event AttemptResult(
        uint256 indexed idx,
        bool paid,
        bytes4 revertSelector,
        uint256 creatorDelta,
        uint256 escrowDelta
    );

    /// @param s        the deployed settlement under test
    /// @param t        the escrow token (to read the bound creator's balance)
    /// @param creator  the bound payout recipient
    /// @param rs       the results to attempt, in order
    /// @param proofs   the matching proofs (one per result)
    /// @return paid          true iff settle() returned without reverting
    /// @return sels          the 4-byte revert selector for each failed attempt (0 if it paid)
    /// @return creatorDeltas creator balance increase caused by each attempt (0 unless it paid)
    /// @return escrowDeltas  escrow balance decrease caused by each attempt (0 unless it paid)
    function runAll(
        JorqethSettlement s,
        IERC20 t,
        address creator,
        PayableResult[] calldata rs,
        bytes[] calldata proofs
    )
        external
        returns (
            bool[] memory paid,
            bytes4[] memory sels,
            uint256[] memory creatorDeltas,
            uint256[] memory escrowDeltas
        )
    {
        uint256 n = rs.length;
        paid = new bool[](n);
        sels = new bytes4[](n);
        creatorDeltas = new uint256[](n);
        escrowDeltas = new uint256[](n);

        for (uint256 i; i < n; i++) {
            uint256 creatorBefore = t.balanceOf(creator);
            uint256 escrowBefore = s.escrowBalance();

            try s.settle(rs[i], proofs[i]) {
                paid[i] = true;
            } catch (bytes memory err) {
                paid[i] = false;
                bytes4 sel;
                if (err.length >= 4) {
                    assembly {
                        sel := mload(add(err, 0x20))
                    }
                }
                sels[i] = sel;
            }

            // Escrow only ever decreases on a real payout, so this subtraction never underflows.
            creatorDeltas[i] = t.balanceOf(creator) - creatorBefore;
            escrowDeltas[i] = escrowBefore - s.escrowBalance();
            emit AttemptResult(i, paid[i], sels[i], creatorDeltas[i], escrowDeltas[i]);
        }
    }
}
