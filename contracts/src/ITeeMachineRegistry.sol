// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Current Flare TEE machine registry interface
/// @notice Minimal ABI used by the official FCE instruction-sender lifecycle.
interface ITeeMachineRegistry {
    function getRandomTeeIds(uint256 extensionId, uint256 count)
        external
        view
        returns (address[] memory teeIds);
}
