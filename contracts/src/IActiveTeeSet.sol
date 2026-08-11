// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Current Flare active TEE machine set
/// @notice Minimal interface for the official MachineManager facet exposed through
///         the FlareTeeManager diamond.
interface IActiveTeeSet {
    function getActiveTeeMachines(uint256 extensionId)
        external
        view
        returns (address[] memory teeIds, string[] memory urls);
}
