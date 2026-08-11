// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {JorqethCampaignFactory} from "../src/JorqethCampaignFactory.sol";
import {JorqethSettlement} from "../src/JorqethSettlement.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {SignatureResultVerifier} from "../src/SignatureResultVerifier.sol";

contract JorqethCampaignFactoryTest is Test {
    MockUSD internal token;
    SignatureResultVerifier internal verifier;
    JorqethCampaignFactory internal factory;

    address internal merchant = makeAddr("merchant");
    address internal creator = makeAddr("creator");

    function setUp() public {
        token = new MockUSD();
        verifier = new SignatureResultVerifier(makeAddr("signer"));
        factory = new JorqethCampaignFactory(token, verifier);
    }

    function test_createCampaign_bindsConfigurationAndRegistersAddress() public {
        bytes32 campaignId = keccak256("campaign");
        bytes32 ruleVersion = keccak256("floor-10-percent");
        uint64 campaignEnd = uint64(block.timestamp + 7 days);

        vm.prank(merchant);
        address created =
            factory.createCampaign(campaignId, creator, 1000, ruleVersion, campaignEnd);

        JorqethSettlement settlement = JorqethSettlement(created);
        assertTrue(factory.isCampaign(created));
        assertEq(address(settlement.token()), address(token));
        assertEq(address(settlement.verifier()), address(verifier));
        assertEq(settlement.merchant(), merchant);
        assertEq(settlement.creator(), creator);
        assertEq(settlement.commissionBps(), 1000);
        assertEq(settlement.ruleVersion(), ruleVersion);
        assertEq(settlement.campaignEnd(), campaignEnd);
    }

    function test_createCampaign_rejectsInvalidInputs() public {
        vm.expectRevert(JorqethCampaignFactory.ZeroCreator.selector);
        factory.createCampaign(
            bytes32(0), address(0), 1000, bytes32(0), uint64(block.timestamp + 1)
        );

        vm.expectRevert(
            abi.encodeWithSelector(JorqethCampaignFactory.InvalidCommission.selector, 0)
        );
        factory.createCampaign(bytes32(0), creator, 0, bytes32(0), uint64(block.timestamp + 1));

        vm.expectRevert(
            abi.encodeWithSelector(
                JorqethCampaignFactory.InvalidCampaignEnd.selector,
                uint64(block.timestamp),
                block.timestamp
            )
        );
        factory.createCampaign(bytes32(0), creator, 1000, bytes32(0), uint64(block.timestamp));
    }
}
