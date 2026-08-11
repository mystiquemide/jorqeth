// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Active TEE set compatibility adapter
/// @notice A local test interface used by ActionResult signature compatibility tests.
/// @dev This method is not part of the current Flare FCE machine registry ABI. A live
///      deployment must use the official instruction lifecycle exposed through
///      `ITeeMachineRegistry.getRandomTeeIds` and `ITeeExtensionRegistry.sendInstructions`.
interface IActiveTeeSet {
    function getActiveTeeMachines(uint256 extensionId)
        external
        view
        returns (address[] memory teeIds, string[] memory urls);
}
