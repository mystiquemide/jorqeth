// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ITeeExtensionRegistry} from "./ITeeExtensionRegistry.sol";
import {ITeeMachineRegistry} from "./ITeeMachineRegistry.sol";

/// @title Jorqeth FCE instruction sender
/// @notice Sends opaque evaluation requests through Flare's current FCE registry lifecycle.
contract JorqethInstructionSender {
    bytes32 public constant OP_TYPE_COMMISSION = bytes32("COMMISSION");
    bytes32 public constant OP_COMMAND_EVALUATE = bytes32("EVALUATE");

    uint256 private constant FIRST_PUBLIC_EXTENSION_ID = 0x10000;

    ITeeExtensionRegistry public immutable TEE_EXTENSION_REGISTRY;
    ITeeMachineRegistry public immutable TEE_MACHINE_REGISTRY;

    uint256 private _extensionId;

    event EvaluationInstructionSent(bytes32 indexed instructionId, address indexed requester);

    constructor(ITeeExtensionRegistry extensionRegistry, ITeeMachineRegistry machineRegistry) {
        require(address(extensionRegistry) != address(0), "extension registry is zero");
        require(address(machineRegistry) != address(0), "machine registry is zero");
        require(address(extensionRegistry).code.length > 0, "extension registry has no code");
        require(address(machineRegistry).code.length > 0, "machine registry has no code");
        TEE_EXTENSION_REGISTRY = extensionRegistry;
        TEE_MACHINE_REGISTRY = machineRegistry;
    }

    /// @notice Caches the public extension id after this sender is registered.
    function setExtensionId() external {
        require(_extensionId == 0, "extension id already set");
        uint256 nextId = TEE_EXTENSION_REGISTRY.nextPublicExtensionId();
        for (uint256 id = FIRST_PUBLIC_EXTENSION_ID; id < nextId; ++id) {
            if (TEE_EXTENSION_REGISTRY.getTeeExtensionInstructionsSender(id) == address(this)) {
                _extensionId = id;
                return;
            }
        }
        revert("extension id not found");
    }

    /// @notice Sends a JSON evaluation request to one registered TEE machine.
    /// @dev The message contains public bindings and an opaque order digest. Raw merchant
    ///      records and credentials belong inside the extension environment.
    function sendEvaluation(bytes calldata message)
        external
        payable
        returns (bytes32 instructionId)
    {
        uint256 id = extensionId();
        address[] memory teeIds = TEE_MACHINE_REGISTRY.getRandomTeeIds(id, 1);
        require(teeIds.length == 1, "no TEE available");

        address[] memory cosigners = new address[](0);
        ITeeExtensionRegistry.TeeInstructionParams memory params =
            ITeeExtensionRegistry.TeeInstructionParams({
                opType: OP_TYPE_COMMISSION,
                opCommand: OP_COMMAND_EVALUATE,
                message: message,
                cosigners: cosigners,
                cosignersThreshold: 0,
                claimBackAddress: msg.sender
            });

        instructionId = TEE_EXTENSION_REGISTRY.sendInstructions{value: msg.value}(teeIds, params);
        emit EvaluationInstructionSent(instructionId, msg.sender);
    }

    function extensionId() public view returns (uint256) {
        require(_extensionId != 0, "extension id is not set");
        return _extensionId;
    }
}
