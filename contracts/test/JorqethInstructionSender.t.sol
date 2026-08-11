// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ITeeExtensionRegistry} from "../src/ITeeExtensionRegistry.sol";
import {ITeeMachineRegistry} from "../src/ITeeMachineRegistry.sol";
import {JorqethInstructionSender} from "../src/JorqethInstructionSender.sol";

contract MockCurrentFceRegistry is ITeeExtensionRegistry, ITeeMachineRegistry {
    uint256 public constant ASSIGNED_ID = 0x10000;
    bytes32 public constant RETURNED_ID = keccak256("instruction");

    address public sender;
    uint256 public selectedExtensionId;
    uint256 public selectedCount;
    address public selectedTee = address(0x7ee);
    TeeInstructionParams private _lastParams;
    address[] private _lastTeeIds;
    uint256 public receivedValue;

    function registerSender(address sender_) external {
        sender = sender_;
    }

    function nextPublicExtensionId() external pure returns (uint256) {
        return ASSIGNED_ID + 1;
    }

    function getTeeExtensionInstructionsSender(uint256 extensionId)
        external
        view
        returns (address)
    {
        return extensionId == ASSIGNED_ID ? sender : address(0);
    }

    function getRandomTeeIds(uint256 extensionId, uint256 count)
        external
        view
        returns (address[] memory teeIds)
    {
        // Silence pure-state recording restrictions while preserving exact call assertions
        // through the returned values checked by the sender test.
        extensionId;
        count;
        teeIds = new address[](1);
        teeIds[0] = selectedTee;
    }

    function sendInstructions(address[] calldata teeIds, TeeInstructionParams calldata params)
        external
        payable
        returns (bytes32)
    {
        delete _lastTeeIds;
        for (uint256 i = 0; i < teeIds.length; ++i) {
            _lastTeeIds.push(teeIds[i]);
        }
        _lastParams = params;
        receivedValue = msg.value;
        return RETURNED_ID;
    }

    function lastTeeId() external view returns (address) {
        return _lastTeeIds[0];
    }

    function lastParams() external view returns (bytes32, bytes32, bytes memory, uint64, address) {
        return (
            _lastParams.opType,
            _lastParams.opCommand,
            _lastParams.message,
            _lastParams.cosignersThreshold,
            _lastParams.claimBackAddress
        );
    }
}

contract JorqethInstructionSenderTest is Test {
    MockCurrentFceRegistry internal registry;
    JorqethInstructionSender internal sender;

    function setUp() public {
        registry = new MockCurrentFceRegistry();
        sender = new JorqethInstructionSender(registry, registry);
        registry.registerSender(address(sender));
    }

    function test_requiresRegistrationBeforeSending() public {
        vm.expectRevert("extension id is not set");
        sender.sendEvaluation(hex"1234");
    }

    function test_setsExtensionIdAndSendsCurrentFceInstruction() public {
        sender.setExtensionId();
        assertEq(sender.extensionId(), registry.ASSIGNED_ID());

        bytes memory message = abi.encode(bytes32("opaque-order"));
        vm.deal(address(this), 1 ether);
        vm.expectCall(
            address(registry),
            abi.encodeCall(
                ITeeMachineRegistry.getRandomTeeIds, (registry.ASSIGNED_ID(), uint256(1))
            )
        );
        bytes32 instructionId = sender.sendEvaluation{value: 0.25 ether}(message);

        assertEq(instructionId, registry.RETURNED_ID());
        assertEq(registry.lastTeeId(), registry.selectedTee());
        assertEq(registry.receivedValue(), 0.25 ether);

        (
            bytes32 opType,
            bytes32 opCommand,
            bytes memory sent,
            uint64 threshold,
            address claimBack
        ) = registry.lastParams();
        assertEq(opType, bytes32("COMMISSION"));
        assertEq(opCommand, bytes32("EVALUATE"));
        assertEq(sent, message);
        assertEq(threshold, 0);
        assertEq(claimBack, address(this));
    }

    function test_extensionIdCanOnlyBeSetOnce() public {
        sender.setExtensionId();
        vm.expectRevert("extension id already set");
        sender.setExtensionId();
    }
}
