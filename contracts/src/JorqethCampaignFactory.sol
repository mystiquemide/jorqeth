// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IResultVerifier} from "./IResultVerifier.sol";
import {JorqethSettlement} from "./JorqethSettlement.sol";

/// @title Jorqeth campaign factory
/// @notice Creates independently funded commission campaigns with a fixed creator,
///         payout rule, and settlement window. Every created address is recorded so
///         the evaluator can reject contracts outside this deployment.
contract JorqethCampaignFactory {
    IERC20 public immutable token;
    IResultVerifier public immutable verifier;
    uint16 public constant SCHEMA_VERSION = 1;

    mapping(address settlement => bool) public isCampaign;

    event CampaignCreated(
        address indexed settlement,
        bytes32 indexed campaignId,
        address indexed merchant,
        address creator,
        uint16 commissionBps,
        bytes32 ruleVersion,
        uint64 campaignEnd
    );

    error ZeroCreator();
    error InvalidCommission(uint16 commissionBps);
    error InvalidCampaignEnd(uint64 campaignEnd, uint256 nowTs);

    constructor(IERC20 token_, IResultVerifier verifier_) {
        require(address(token_) != address(0), "factory: zero token");
        require(address(verifier_) != address(0), "factory: zero verifier");
        token = token_;
        verifier = verifier_;
    }

    function createCampaign(
        bytes32 campaignId,
        address creator,
        uint16 commissionBps,
        bytes32 ruleVersion,
        uint64 campaignEnd
    ) external returns (address settlement) {
        if (creator == address(0)) revert ZeroCreator();
        if (commissionBps == 0 || commissionBps > 10_000) {
            revert InvalidCommission(commissionBps);
        }
        if (campaignEnd <= block.timestamp) {
            revert InvalidCampaignEnd(campaignEnd, block.timestamp);
        }

        settlement = address(
            new JorqethSettlement(
                token,
                verifier,
                SCHEMA_VERSION,
                campaignId,
                msg.sender,
                creator,
                commissionBps,
                ruleVersion,
                campaignEnd
            )
        );
        isCampaign[settlement] = true;

        emit CampaignCreated(
            settlement, campaignId, msg.sender, creator, commissionBps, ruleVersion, campaignEnd
        );
    }
}
