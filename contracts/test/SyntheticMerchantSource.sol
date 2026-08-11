// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {JorqethEvaluator} from "../src/JorqethEvaluator.sol";

/// @title Synthetic merchant record source
/// @notice The fixed, non-production merchant record feed. It reads one order record
///         from spec/jorqeth-v1.json -- the canonical `jorqeth.synthetic.merchant.v1`
///         data source named in the frozen spec -- and returns it as a MerchantRecord
///         the evaluator can read. This stands in for a merchant's private order API:
///         synthetic, testnet-only, and exposing only the opaque digest, agreed
///         business class, and net amount. No customer or revenue field is present.
/// @dev A library rather than a contract so both the proof scripts and the tests read
///      records the same way. It uses the file/JSON cheatcodes, so it lives under
///      contracts/test (never linked into deployed bytecode). Foundry grants read
///      access to ./spec via `fs_permissions` in foundry.toml.
library SyntheticMerchantSource {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    string private constant SPEC_PATH = "spec/jorqeth-v1.json";

    /// @notice Load the synthetic record for `orderKey` (e.g. "ORDER-A") from the spec.
    function record(string memory orderKey)
        internal
        view
        returns (JorqethEvaluator.MerchantRecord memory rec)
    {
        string memory json = vm.readFile(SPEC_PATH);
        string memory base = string.concat(".orders[\"", orderKey, "\"]");
        rec.orderDigest = vm.parseJsonBytes32(json, string.concat(base, ".orderDigest"));
        rec.class = vm.parseJsonString(json, string.concat(base, ".class"));
        rec.netAmount = vm.parseJsonUint(json, string.concat(base, ".netAmount"));
    }

    /// @notice The campaign commission rate (basis points) from the spec.
    function commissionBps() internal view returns (uint16) {
        string memory json = vm.readFile(SPEC_PATH);
        return uint16(vm.parseJsonUint(json, ".campaign.commissionBps"));
    }

    /// @notice The spec's own expected outcome for `orderKey`, for cross-checking the
    ///         evaluator against the frozen golden reference.
    function expected(string memory orderKey)
        internal
        view
        returns (uint8 eligibilityCode, uint256 amount)
    {
        string memory json = vm.readFile(SPEC_PATH);
        string memory base = string.concat(".orders[\"", orderKey, "\"]");
        eligibilityCode =
            uint8(vm.parseJsonUint(json, string.concat(base, ".expectedEligibilityCode")));
        amount = vm.parseJsonUint(json, string.concat(base, ".expectedCommission"));
    }
}
