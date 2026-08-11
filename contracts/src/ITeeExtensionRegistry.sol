// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Current Flare TEE extension registry interface
/// @notice Minimal ABI copied from the official FCE extension scaffold.
interface ITeeExtensionRegistry {
    struct TeeInstructionParams {
        bytes32 opType;
        bytes32 opCommand;
        bytes message;
        address[] cosigners;
        uint64 cosignersThreshold;
        address claimBackAddress;
    }

    function sendInstructions(address[] calldata teeIds, TeeInstructionParams calldata params)
        external
        payable
        returns (bytes32 instructionId);

    function nextPublicExtensionId() external view returns (uint256);

    function getTeeExtensionInstructionsSender(uint256 extensionId) external view returns (address);
}
