// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IResultVerifier} from "../contracts/src/IResultVerifier.sol";
import {JorqethCampaignFactory} from "../contracts/src/JorqethCampaignFactory.sol";

/// @notice Deploys only a new campaign factory bound to Coston2 FTestXRP while
///         reusing the already-deployed Jorqeth FCE ActionResult verifier.
contract DeployFxrpFactory is Script {
    address internal constant COSTON2_FTEST_XRP =
        0x0b6A3645c240605887a5532109323A3E12273dc7;

    function run() external {
        uint256 deployerKey = vm.envUint("JORQETH_DEPLOYER_KEY");
        address verifier = vm.envAddress("JORQETH_FCE_VERIFIER_ADDRESS");
        address fxrp = vm.envOr("JORQETH_FXRP_TOKEN_ADDRESS", COSTON2_FTEST_XRP);

        require(verifier != address(0), "fxrp deploy: zero verifier");
        require(fxrp != address(0), "fxrp deploy: zero token");

        vm.startBroadcast(deployerKey);
        JorqethCampaignFactory factory =
            new JorqethCampaignFactory(IERC20(fxrp), IResultVerifier(verifier));
        vm.stopBroadcast();

        console2.log("FTestXRP", fxrp);
        console2.log("FCE verifier", verifier);
        console2.log("FXRP JorqethCampaignFactory", address(factory));
    }
}
