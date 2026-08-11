// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PayableResult, Eligibility} from "./JorqethTypes.sol";

/// @title Jorqeth commission evaluator
/// @notice The off-chain settlement rule, reproduced in Solidity so it is auditable
///         and testable. In production a Flare Compute Extension reads the merchant's
///         private order record and runs exactly this logic confidentially; here the
///         same rule runs locally over a fixed synthetic record source. It takes a
///         merchant record and the campaign's commission rate and DERIVES the two
///         result fields a settlement depends on -- the eligibility code and the
///         payable amount -- rather than those being asserted as constants.
/// @dev No raw merchant or customer field ever leaves this boundary. The record's
///      `orderDigest` is already an opaque reference; `netAmount` is the agreed
///      eligible net order amount and never appears in the signed result.
library JorqethEvaluator {
    /// @notice A single merchant order record: the confidential input the evaluator
    ///         reads. `class` is the agreed business status of the order; `netAmount`
    ///         is the eligible net amount in the escrow token's smallest unit.
    struct MerchantRecord {
        bytes32 orderDigest; // opaque order reference (never the raw reference)
        string class; // agreed business class: "eligible" | "refunded" | "unmatched"
        uint256 netAmount; // eligible net order amount, escrow-token smallest unit
    }

    // Recognized business classes, hashed for cheap comparison. These are the agreed
    // vocabulary of the merchant record source (spec/jorqeth-v1.json).
    bytes32 private constant CLASS_ELIGIBLE = keccak256(bytes("eligible"));
    bytes32 private constant CLASS_REFUNDED = keccak256(bytes("refunded"));
    bytes32 private constant CLASS_UNMATCHED = keccak256(bytes("unmatched"));

    /// @notice Apply the frozen settlement rule to one merchant record.
    /// @dev The commission is the single documented floor rule
    ///      `floor(netAmount * commissionBps / 10000)` (spec/jorqeth-v1.json), earned
    ///      only by an eligible order. A refunded or unmatched order is a terminal
    ///      negative that pays zero. Any unrecognized class fails closed as
    ///      INFRASTRUCTURE_UNKNOWN (never a payable outcome), so a record the evaluator
    ///      cannot classify can never move value.
    /// @param rec the merchant order record read from the record source
    /// @param commissionBps the campaign commission rate in basis points
    /// @return eligibilityCode the derived terminal code (see Eligibility)
    /// @return amount the derived exact payout (0 for every non-eligible outcome)
    function evaluate(MerchantRecord memory rec, uint16 commissionBps)
        internal
        pure
        returns (uint8 eligibilityCode, uint256 amount)
    {
        bytes32 class = keccak256(bytes(rec.class));
        if (class == CLASS_ELIGIBLE) {
            return (Eligibility.ELIGIBLE, commission(rec.netAmount, commissionBps));
        }
        if (class == CLASS_REFUNDED || class == CLASS_UNMATCHED) {
            return (Eligibility.INELIGIBLE, 0);
        }
        return (Eligibility.INFRASTRUCTURE_UNKNOWN, 0);
    }

    /// @notice The frozen commission rule: `floor(net * bps / 10000)`.
    /// @dev One documented rounding direction (truncation toward zero), identical to
    ///      the reference pinned in contracts/test/CommissionMath.t.sol.
    function commission(uint256 net, uint16 bps) internal pure returns (uint256) {
        return (net * bps) / 10_000;
    }

    /// @notice Read a record, apply the rule, and assemble the minimal domain-bound
    ///         result the settlement contract verifies. The `amount` and
    ///         `eligibilityCode` are the evaluator's output, never passed in.
    /// @dev The caller supplies only the campaign/domain binding and the
    ///      evaluator-generated envelope fields (nonce, issuedAt, expiry). This is the
    ///      full record -> rule -> result derivation in one place.
    function toResult(
        MerchantRecord memory rec,
        uint16 schemaVersion,
        bytes32 campaignId,
        address creator,
        uint16 commissionBps,
        uint256 chainId,
        address settlementContract,
        bytes32 ruleVersion,
        bytes32 nonce,
        uint64 issuedAt,
        uint64 expiry
    ) internal pure returns (PayableResult memory r) {
        (uint8 code, uint256 amount) = evaluate(rec, commissionBps);
        r = PayableResult({
            schemaVersion: schemaVersion,
            campaignId: campaignId,
            orderDigest: rec.orderDigest,
            creator: creator,
            amount: amount,
            eligibilityCode: code,
            chainId: chainId,
            settlementContract: settlementContract,
            ruleVersion: ruleVersion,
            nonce: nonce,
            issuedAt: issuedAt,
            expiry: expiry
        });
    }
}
