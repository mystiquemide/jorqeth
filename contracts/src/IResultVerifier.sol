// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PayableResult} from "./JorqethTypes.sol";

/// @title Jorqeth result verification boundary
/// @notice The settlement contract delegates "is this a genuine, domain-bound
///         result from the confidential evaluator?" to an implementation of this
///         interface. The deployment injects either a local signature verifier or
///         the Flare Compute Extension result verifier, WITHOUT changing the
///         settlement contract.
/// @dev The verifier is responsible only for origin authenticity of the result
///      bytes. Domain binding (chainId, settlementContract), expiry, replay, and
///      amount/recipient enforcement live in the settlement contract so they hold
///      regardless of which verifier is installed.
interface IResultVerifier {
    /// @param result The decoded payable result.
    /// @param proof  Verifier-specific attestation bytes (an EIP-712 signature for
    ///               the local verifier; the Flare-supplied verification material
    ///               for the FCC verifier).
    /// @return ok    True only if `result` genuinely originates from the trusted
    ///               confidential evaluator for this deployment.
    function verify(PayableResult calldata result, bytes calldata proof)
        external
        view
        returns (bool ok);

    /// @notice Human/tooling label for the active verification mode, e.g.
    ///         "local-signature-v1" or "action-result-compat-v1". Used by evidence tooling to
    ///         avoid ever labelling a simulated boundary as production hardware.
    function mode() external view returns (string memory);
}
