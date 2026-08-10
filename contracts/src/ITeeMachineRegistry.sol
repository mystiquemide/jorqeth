// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Minimal Flare TEE machine registry view
/// @notice Jorqeth's read-only view of the on-chain registry that lists the active
///         TEE signer addresses (`teeId`s) for a given extension. On Coston2 this is
///         the `FlareTeeManager` diamond (MachineManager facet). The real interface
///         (`flare-smart-contracts-v2` / the reference copy bundled in the official
///         `fce-sign` scaffold) exposes more; Jorqeth needs only the active set.
/// @dev A `teeId` is the machine's secp256k1 signer address
///      (`keccak256(pubkey.x ‖ pubkey.y)[12:]`). A result is authentic only if its
///      recovered signer is a currently-active `teeId` for Jorqeth's extension.
interface ITeeMachineRegistry {
    /// @param extensionId The public extension id assigned to the Jorqeth
    ///        instruction sender by the TEE extension registry.
    /// @return teeIds The active TEE signer addresses for that extension.
    /// @return urls   Their proxy URLs (unused on-chain; kept to match the real ABI).
    function getActiveTeeMachines(uint256 extensionId)
        external
        view
        returns (address[] memory teeIds, string[] memory urls);
}
