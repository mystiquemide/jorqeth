// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ITeeMachineRegistry} from "../../src/ITeeMachineRegistry.sol";

/// @title Mock Flare TEE machine registry
/// @notice Test double for the on-chain FlareTeeManager (MachineManager facet).
///         Returns a configurable active TEE-signer set for one extension id so the
///         FccResultVerifier can be exercised without a live Coston2 connection.
contract MockTeeMachineRegistry is ITeeMachineRegistry {
    mapping(uint256 extensionId => address[]) private _active;

    function setActive(uint256 extensionId, address[] calldata teeIds) external {
        delete _active[extensionId];
        for (uint256 i = 0; i < teeIds.length; ++i) {
            _active[extensionId].push(teeIds[i]);
        }
    }

    function getActiveTeeMachines(uint256 extensionId)
        external
        view
        returns (address[] memory teeIds, string[] memory urls)
    {
        teeIds = _active[extensionId];
        urls = new string[](teeIds.length); // urls unused on-chain
    }
}
