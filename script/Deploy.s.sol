// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MockUSD} from "../contracts/src/MockUSD.sol";
import {SignatureResultVerifier} from "../contracts/src/SignatureResultVerifier.sol";
import {JorqethCampaignFactory} from "../contracts/src/JorqethCampaignFactory.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("JORQETH_DEPLOYER_KEY");
        address evaluatorSigner = vm.envAddress("JORQETH_EVALUATOR_SIGNER");

        vm.startBroadcast(deployerKey);
        MockUSD token = new MockUSD();
        SignatureResultVerifier verifier = new SignatureResultVerifier(evaluatorSigner);
        JorqethCampaignFactory factory = new JorqethCampaignFactory(token, verifier);
        vm.stopBroadcast();

        console2.log("MockUSD", address(token));
        console2.log("SignatureResultVerifier", address(verifier));
        console2.log("JorqethCampaignFactory", address(factory));
        console2.log("Evaluator signer", evaluatorSigner);
    }
}
