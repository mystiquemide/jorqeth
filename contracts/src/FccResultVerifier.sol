// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PayableResult} from "./JorqethTypes.sol";
import {IResultVerifier} from "./IResultVerifier.sol";
import {ITeeMachineRegistry} from "./ITeeMachineRegistry.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title Flare ActionResult signature compatibility verifier
/// @notice Reconstructs the hash/signature format used by the pinned Flare
///         `ActionResult` libraries, recovers the secp256k1 signer, and checks that
///         signer against the deterministic membership adapter supplied at
///         deployment.
/// @dev This contract is a compatibility prototype, not a completed Coston2 FCC
///      trust boundary. The current official FCE scaffold routes instructions with
///      `TeeMachineRegistry.getRandomTeeIds(extensionId, count)`. Jorqeth's local
///      `ITeeMachineRegistry.getActiveTeeMachines` adapter is not that production
///      ABI, so this verifier must not be described as drop-in Coston2 integration.
///
///      The signing construction reproduced from pinned Flare sources is:
///
///        Data    = abi.encode(PayableResult)
///        arHash  = keccak256(keccak256(Data) ‖ instructionId
///                            ‖ keccak256(submissionTag) ‖ status)
///        payload = keccak256(abi.encode(
///                    bytes32("TEE_ACTION_RESULT"), block.chainid, arHash))
///        digest  = toEthSignedMessageHash(payload)
///        signer  = ecrecover(digest, signature)
///
///      Pinned sources:
///        - tee-node v0.0.24 pkg/types/actions.go
///        - tee-node v0.0.24 internal/router/utils.go
///        - tee-node v0.0.24 pkg/utils/crypto.go
///        - go-flare-common 09a10067e6a4 pkg/signing/hash.go, prefixes.go
contract FccResultVerifier is IResultVerifier {
    bytes32 internal constant TEE_ACTION_RESULT_PREFIX = bytes32("TEE_ACTION_RESULT");
    uint8 internal constant STATUS_OK = 1;

    /// @notice Deterministic signer-set adapter used by the compatibility boundary.
    /// @dev Not the current official Coston2 FCE registry ABI. See interface docs.
    ITeeMachineRegistry public immutable registry;
    /// @notice Logical extension id used to scope the local signer set.
    uint256 public immutable extensionId;
    /// @notice Declared test mode, e.g. `simulated-attestation`.
    /// @dev The string is descriptive metadata. It is not proof of a real TEE or
    ///      production attestation.
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
    /// @dev The mode names the signature-format compatibility path and caller-supplied
    ///      attestation label. It must not be used as evidence that a Coston2 TEE
    ///      registration or production Confidential Space attestation occurred.
    function mode() external view returns (string memory) {
        return string.concat("flare-fcc-v1/", attestationMode);
    }

    /// @inheritdoc IResultVerifier
    /// @param result The decoded payable result covered by the signature.
    /// @param proof  abi.encode(bytes32 instructionId, bytes submissionTag,
    ///               uint8 status, bytes signature).
    function verify(PayableResult calldata result, bytes calldata proof)
        external
        view
        returns (bool)
    {
        (bytes32 instructionId, bytes memory submissionTag, uint8 status, bytes memory signature) =
            abi.decode(proof, (bytes32, bytes, uint8, bytes));

        bytes32 dataHash = keccak256(abi.encode(result));
        bytes32 arHash =
            keccak256(abi.encodePacked(dataHash, instructionId, keccak256(submissionTag), status));
        bytes32 payload = keccak256(abi.encode(TEE_ACTION_RESULT_PREFIX, block.chainid, arHash));
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(payload);

        // A correctly signed error or timeout must never become a payable result.
        if (status != STATUS_OK) {
            return false;
        }

        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError) {
            return false;
        }

        // Local compatibility proof: recovered signer must belong to the deterministic
        // test set for this logical extension id.
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
