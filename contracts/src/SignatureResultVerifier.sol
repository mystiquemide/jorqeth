// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PayableResult} from "./JorqethTypes.sol";
import {JorqethResult} from "./JorqethResult.sol";
import {IResultVerifier} from "./IResultVerifier.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title Local signature result verifier
/// @notice Stand-in for the Flare Compute Extension result verifier. It recovers an
///         EIP-712 signature over the domain-bound result and checks it against a
///         single trusted evaluator key. This exercises the settlement invariant end
///         to end locally without claiming to be the sponsor primitive.
/// @dev The EIP-712 domain is rebuilt here from the result's own chainId and
///      settlementContract fields, so a signature made for one (chain, contract)
///      pair cannot verify against another. The settlement contract additionally
///      checks those fields against itself, giving defence in depth against
///      cross-domain replay.
contract SignatureResultVerifier is IResultVerifier {
    using JorqethResult for PayableResult;

    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant NAME_HASH = keccak256("Jorqeth");
    bytes32 private constant VERSION_HASH = keccak256("1");

    /// @notice The trusted confidential-evaluator public key. Here this is a test
    ///         key held only off-chain by the settlement operator's evaluator stub.
    address public immutable trustedSigner;

    constructor(address trustedSigner_) {
        require(trustedSigner_ != address(0), "verifier: zero signer");
        trustedSigner = trustedSigner_;
    }

    /// @inheritdoc IResultVerifier
    function mode() external pure returns (string memory) {
        return "local-signature-v1";
    }

    /// @inheritdoc IResultVerifier
    function verify(PayableResult calldata result, bytes calldata proof)
        external
        view
        returns (bool)
    {
        // Rebuild the domain separator from the result's declared domain so a
        // signature is only valid for the exact (chainId, settlementContract) it
        // was issued for.
        bytes32 domainSeparator = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, result.chainId, result.settlementContract
            )
        );
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", domainSeparator, result.hashStruct()));

        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, proof);
        if (err != ECDSA.RecoverError.NoError) {
            return false;
        }
        return recovered == trustedSigner;
    }
}
