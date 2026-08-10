// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PayableResult} from "./JorqethTypes.sol";

/// @title Jorqeth EIP-712 result hashing
/// @notice Frozen struct-hash encoding for the PayableResult. The type string is
///         locked in spec/jorqeth-v1.json and must not change without a schema bump.
library JorqethResult {
    /// @dev keccak256 of the frozen PayableResult type string.
    bytes32 internal constant PAYABLE_RESULT_TYPEHASH = keccak256(
        "PayableResult(uint16 schemaVersion,bytes32 campaignId,bytes32 orderDigest,address creator,uint256 amount,uint8 eligibilityCode,uint256 chainId,address settlementContract,bytes32 ruleVersion,bytes32 nonce,uint64 issuedAt,uint64 expiry)"
    );

    /// @notice EIP-712 hashStruct(result). Domain separation is applied by the caller.
    function hashStruct(PayableResult memory r) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                PAYABLE_RESULT_TYPEHASH,
                r.schemaVersion,
                r.campaignId,
                r.orderDigest,
                r.creator,
                r.amount,
                r.eligibilityCode,
                r.chainId,
                r.settlementContract,
                r.ruleVersion,
                r.nonce,
                r.issuedAt,
                r.expiry
            )
        );
    }
}
