// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Jorqeth shared types
/// @notice The minimal, domain-bound settlement result produced by the confidential
///         evaluation boundary (a Flare Compute Extension in production; a trusted
///         signer stand-in during the local settlement-invariant run).
/// @dev No raw merchant or customer field appears here. `orderDigest` is an opaque
///      digest of the merchant order reference, never the reference itself.
struct PayableResult {
    uint16 schemaVersion; // frozen spec schema version
    bytes32 campaignId; // binds the result to one campaign
    bytes32 orderDigest; // opaque order reference digest
    address creator; // bound payout recipient
    uint256 amount; // exact payout in escrow-token smallest unit (0 for negative)
    uint8 eligibilityCode; // 0 INELIGIBLE, 1 ELIGIBLE, 2 INFRASTRUCTURE_UNKNOWN
    uint256 chainId; // domain binding: target chain
    address settlementContract; // domain binding: target contract
    bytes32 ruleVersion; // commission rule identity
    bytes32 nonce; // uniqueness salt from the evaluator
    uint64 issuedAt; // evaluation timestamp
    uint64 expiry; // result is unusable after this timestamp
}

/// @notice Canonical eligibility codes. Only ELIGIBLE and INELIGIBLE are terminal,
///         payable-path outcomes a verifier may sign. INFRASTRUCTURE_UNKNOWN must
///         never reach settlement as a payable result; it fails closed.
library Eligibility {
    uint8 internal constant INELIGIBLE = 0;
    uint8 internal constant ELIGIBLE = 1;
    uint8 internal constant INFRASTRUCTURE_UNKNOWN = 2;
}
