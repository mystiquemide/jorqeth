// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PayableResult} from "./JorqethTypes.sol";
import {IResultVerifier} from "./IResultVerifier.sol";
import {ITeeMachineRegistry} from "./ITeeMachineRegistry.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title Flare Confidential Compute result verifier (Milestone 2)
/// @notice The real FCC result-authenticity boundary. It reconstructs the exact
///         hash the Flare TEE node signs over an `ActionResult`, recovers the
///         secp256k1 signer, and accepts the result only if that signer is a
///         currently-active TEE machine (`teeId`) for Jorqeth's registered
///         extension. This replaces the Milestone 1 `SignatureResultVerifier`
///         without any change to `JorqethSettlement`, its schema, or its tests.
/// @dev The signing scheme is frozen byte-for-byte from the pinned official
///      sources and is reproduced here exactly:
///
///        Data    = abi.encode(PayableResult)                      // the extension's output
///        arHash  = keccak256(keccak256(Data) ‖ instructionId
///                            ‖ keccak256(submissionTag) ‖ status)  // tee-node ActionResult.Hash()
///        payload = keccak256(abi.encode(
///                    bytes32("TEE_ACTION_RESULT"), block.chainid, arHash))  // signing.Payload.Hash()
///        digest  = toEthSignedMessageHash(payload)                // EIP-191, accounts.TextHash
///        signer  = ecrecover(digest, signature) == teeId
///
///      Sources (fixed refs):
///        - tee-node v0.0.24 pkg/types/actions.go        (ActionResult + Hash)
///        - tee-node v0.0.24 internal/router/utils.go    (generic SignResult path)
///        - tee-node v0.0.24 pkg/utils/crypto.go         (EIP-191 Sign)
///        - go-flare-common 09a10067e6a4 pkg/signing/hash.go, prefixes.go
///
///      Attestation mode (simulated vs production GCP Confidential Space) is an
///      off-chain registration property, not visible on-chain. It is surfaced
///      honestly through `mode()` so evidence tooling never labels a simulated
///      boundary as production hardware.
contract FccResultVerifier is IResultVerifier {
    /// @dev Domain prefix for TEE action-result signatures, left-aligned ASCII,
    ///      matching go-flare-common `mustStringBytes32("TEE_ACTION_RESULT")`.
    bytes32 internal constant TEE_ACTION_RESULT_PREFIX = bytes32("TEE_ACTION_RESULT");

    /// @dev The only ActionResult status that denotes a successful evaluation in
    ///      tee-node v0.0.24: success paths set `Status: 1`, while `errorResult`
    ///      / `processorutils.Invalid` set `Status: 0` and `DeadlineExceeded`
    ///      sets `Status: 3` (all genuinely signed). A non-OK status is a real
    ///      TEE artifact reporting failure or timeout, so it must never pay even
    ///      though its signature is authentic.
    uint8 internal constant STATUS_OK = 1;

    /// @notice On-chain registry listing active TEE signer addresses per extension
    ///         (the FlareTeeManager diamond on Coston2).
    ITeeMachineRegistry public immutable registry;
    /// @notice The public extension id assigned to Jorqeth's instruction sender.
    uint256 public immutable extensionId;
    /// @notice Honest attestation-mode label, e.g. "simulated-attestation" or
    ///         "production-attestation". Part of `mode()` so it can never be hidden.
    string internal attestationMode;

    error EmptyRegistry();

    constructor(
        ITeeMachineRegistry registry_,
        uint256 extensionId_,
        string memory attestationMode_
    ) {
        require(address(registry_) != address(0), "fcc: zero registry");
        require(bytes(attestationMode_).length != 0, "fcc: empty attestation mode");
        registry = registry_;
        extensionId = extensionId_;
        attestationMode = attestationMode_;
    }

    /// @inheritdoc IResultVerifier
    /// @dev e.g. "flare-fcc-v1/simulated-attestation". Never claims production
    ///      hardware unless the deployment was registered in production mode.
    function mode() external view returns (string memory) {
        return string.concat("flare-fcc-v1/", attestationMode);
    }

    /// @inheritdoc IResultVerifier
    /// @param result The decoded payable result the TEE evaluated and signed.
    /// @param proof  abi.encode(bytes32 instructionId, bytes submissionTag,
    ///               uint8 status, bytes signature) — the ActionResult envelope
    ///               fields (other than Data, which is abi.encode(result)) plus the
    ///               65-byte TEE signature.
    function verify(PayableResult calldata result, bytes calldata proof)
        external
        view
        returns (bool)
    {
        (bytes32 instructionId, bytes memory submissionTag, uint8 status, bytes memory signature) =
            abi.decode(proof, (bytes32, bytes, uint8, bytes));

        // 1. Reconstruct the TEE-signed digest exactly (see @dev above). Data is
        //    recomputed from `result` itself, so the signature is bound to every
        //    result field; a separately supplied Data blob is never trusted.
        bytes32 dataHash = keccak256(abi.encode(result));
        bytes32 arHash =
            keccak256(abi.encodePacked(dataHash, instructionId, keccak256(submissionTag), status));
        bytes32 payload = keccak256(abi.encode(TEE_ACTION_RESULT_PREFIX, block.chainid, arHash));
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(payload);

        // 2. Reject any non-OK evaluation. `status` is bound into the signature
        //    above, so it cannot be swapped after signing; this rejects a genuinely
        //    TEE-signed error (status 0) or timeout (status 3) result whose Data
        //    still decodes to a payable outcome. Fail closed.
        if (status != STATUS_OK) {
            return false;
        }

        // 3. Recover the signer.
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError) {
            return false;
        }

        // 4. Accept only if the signer is a currently-active TEE machine for this
        //    extension. Fail closed on an empty active set.
        (address[] memory teeIds,) = registry.getActiveTeeMachines(extensionId);
        uint256 n = teeIds.length;
        if (n == 0) revert EmptyRegistry();
        for (uint256 i = 0; i < n; ++i) {
            if (teeIds[i] == recovered) {
                return true;
            }
        }
        return false;
    }
}
