// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Deterministic TEE signer-set adapter for FCC compatibility tests
/// @notice This is the signer-membership interface used by Jorqeth's local
///         `FccResultVerifier` tests. It is intentionally deterministic so tests can
///         prove that only an allowed signer is accepted.
/// @dev This is NOT the current official Flare FCE `TeeMachineRegistry` ABI.
///      The current official FCE scaffold exposes
///      `getRandomTeeIds(uint256 extensionId, uint256 count)` for instruction
///      routing. A later random selection is not sufficient proof that a recovered
///      signer produced a particular instruction result, so Jorqeth must not deploy
///      this adapter against Coston2 as though it were the sponsor registry.
///
///      Production integration must bind the TEE selected by the current official
///      instruction lifecycle to the result that reaches settlement, or use another
///      sponsor-supported signer-membership proof exposed by the then-current FCC
///      contracts.
interface ITeeMachineRegistry {
    /// @return teeIds Deterministic allowed signer set used by local compatibility tests.
    /// @return urls   Optional metadata. Jorqeth does not consume these values.
    function getActiveTeeMachines(uint256 extensionId)
        external
        view
        returns (address[] memory teeIds, string[] memory urls);
}
