// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PayableResult, Eligibility} from "./JorqethTypes.sol";
import {IResultVerifier} from "./IResultVerifier.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Jorqeth settlement contract
/// @notice Holds merchant-funded escrow for one campaign and releases the exact
///         commission for an eligible, domain-bound, non-replayed confidential
///         result. Every negative, malformed, expired, wrong-domain, wrong-amount,
///         wrong-recipient, and duplicate case pays zero.
/// @dev Settlement invariant: no valid unexpired correctly-domain-bound result for
///      an eligible record means no commission can leave escrow; a valid result can
///      release only the bound amount to the bound creator once.
contract JorqethSettlement is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Immutable configuration ---

    /// @notice Escrow asset (a synthetic test ERC-20 in the prototype).
    IERC20 public immutable token;
    /// @notice Result verifier used to authenticate settlement results. The deployment
    ///         may use the local signature verifier or the FCC compatibility verifier.
    ///         Immutable so the trust root cannot be swapped after funding.
    IResultVerifier public immutable verifier;
    /// @notice Frozen schema version this deployment accepts.
    uint16 public immutable schemaVersion;

    // --- Campaign configuration (single campaign prototype) ---

    bytes32 public immutable campaignId;
    address public immutable merchant; // funds and can reclaim leftover escrow
    address public immutable creator; // the only valid payout recipient
    uint16 public immutable commissionBps; // informational bound; amount is verified per result
    bytes32 public immutable ruleVersion; // commission rule identity
    /// @notice Unix time at/after which the merchant may reclaim unspent escrow.
    ///         Before this the escrow is locked, and `settle` rejects any result
    ///         whose expiry exceeds it, so the settlement and withdrawal windows are
    ///         disjoint and a valid in-window result cannot be stranded.
    uint64 public immutable campaignEnd;

    // --- State ---

    /// @notice Escrow currently held for this campaign.
    uint256 public escrowBalance;
    /// @notice Total paid out to the creator across all settlements.
    uint256 public totalSettled;
    /// @notice One-time settlement guard, keyed by order digest.
    mapping(bytes32 orderDigest => bool) public settled;

    // --- Events (carry no raw merchant or customer field) ---

    event CampaignFunded(
        bytes32 indexed campaignId, address indexed merchant, uint256 amount, uint256 escrowBalance
    );
    event Settled(
        bytes32 indexed campaignId,
        bytes32 indexed orderDigest,
        address indexed creator,
        uint8 eligibilityCode,
        uint256 amount
    );
    event EscrowWithdrawn(bytes32 indexed campaignId, address indexed merchant, uint256 amount);

    // --- Errors ---

    error NotMerchant();
    error ZeroFunding();
    error WrongSchema(uint16 got, uint16 want);
    error WrongCampaign(bytes32 got, bytes32 want);
    error WrongChain(uint256 got, uint256 want);
    error WrongContract(address got, address want);
    error WrongCreator(address got, address want);
    error WrongRuleVersion(bytes32 got, bytes32 want);
    error Expired(uint64 expiry, uint256 nowTs);
    error ExpiryAfterCampaignEnd(uint64 expiry, uint64 campaignEnd); // result outlives the escrow lock
    error NotYetIssued(uint64 issuedAt, uint256 nowTs);
    error AlreadySettled(bytes32 orderDigest);
    error BadResult(); // verifier rejected authenticity
    error NonPayableCode(uint8 code); // e.g. INFRASTRUCTURE_UNKNOWN reaching settlement
    error AmountNotZeroForIneligible(uint256 amount);
    error InsufficientEscrow(uint256 amount, uint256 available);
    error EscrowLocked(uint64 campaignEnd, uint256 nowTs); // withdrawal before campaign end

    constructor(
        IERC20 token_,
        IResultVerifier verifier_,
        uint16 schemaVersion_,
        bytes32 campaignId_,
        address merchant_,
        address creator_,
        uint16 commissionBps_,
        bytes32 ruleVersion_,
        uint64 campaignEnd_
    ) {
        require(address(token_) != address(0), "settlement: zero token");
        require(address(verifier_) != address(0), "settlement: zero verifier");
        require(merchant_ != address(0), "settlement: zero merchant");
        require(creator_ != address(0), "settlement: zero creator");
        require(campaignEnd_ > block.timestamp, "settlement: campaign end in past");
        token = token_;
        verifier = verifier_;
        schemaVersion = schemaVersion_;
        campaignId = campaignId_;
        merchant = merchant_;
        creator = creator_;
        commissionBps = commissionBps_;
        ruleVersion = ruleVersion_;
        campaignEnd = campaignEnd_;
    }

    /// @notice Merchant funds campaign escrow. Escrow must exist before any
    ///         settlement can release value.
    /// @dev Caller must have approved `amount` to this contract first.
    function fund(uint256 amount) external {
        if (msg.sender != merchant) revert NotMerchant();
        if (amount == 0) revert ZeroFunding();
        token.safeTransferFrom(msg.sender, address(this), amount);
        escrowBalance += amount;
        emit CampaignFunded(campaignId, msg.sender, amount, escrowBalance);
    }

    /// @notice Settle one confidential result. Pays the exact bound amount to the
    ///         bound creator for an eligible result, records zero for a valid
    ///         negative result, and reverts every unsafe path so escrow is
    ///         untouched. Idempotent per order digest.
    /// @param r     The domain-bound payable result.
    /// @param proof Verifier-specific authenticity material.
    function settle(PayableResult calldata r, bytes calldata proof) external nonReentrant {
        // 1. Static domain and schema binding checks (cheap, fail closed).
        if (r.schemaVersion != schemaVersion) revert WrongSchema(r.schemaVersion, schemaVersion);
        if (r.campaignId != campaignId) revert WrongCampaign(r.campaignId, campaignId);
        if (r.chainId != block.chainid) revert WrongChain(r.chainId, block.chainid);
        if (r.settlementContract != address(this)) {
            revert WrongContract(r.settlementContract, address(this));
        }
        if (r.creator != creator) revert WrongCreator(r.creator, creator);
        if (r.ruleVersion != ruleVersion) revert WrongRuleVersion(r.ruleVersion, ruleVersion);
        if (r.issuedAt > block.timestamp) revert NotYetIssued(r.issuedAt, block.timestamp);
        if (r.expiry <= block.timestamp) revert Expired(r.expiry, block.timestamp);
        // A settleable result must expire no later than the escrow lock lifts. This
        // makes the settlement window (now < expiry) and the withdrawal window
        // (now >= campaignEnd) provably disjoint, so a valid result cannot be
        // stranded by a merchant withdrawal at campaignEnd. Enforced here instead
        // of relying on an off-chain expiry convention.
        if (r.expiry > campaignEnd) revert ExpiryAfterCampaignEnd(r.expiry, campaignEnd);

        // 2. Replay guard. Reserve the digest before any external transfer so a
        //    reentrant or duplicate call cannot pay twice (checks-effects).
        if (settled[r.orderDigest]) revert AlreadySettled(r.orderDigest);

        // 3. Authenticity: only a result accepted by the immutable verifier may
        //    move the state machine forward. Everything above is public data; this
        //    boundary supplies the origin/authenticity proof for the selected mode.
        if (!verifier.verify(r, proof)) revert BadResult();

        // 4. Eligibility handling. Only ELIGIBLE and INELIGIBLE are terminal
        //    payable-path outcomes. INFRASTRUCTURE_UNKNOWN (or any other code)
        //    fails closed and moves nothing.
        if (r.eligibilityCode == Eligibility.INELIGIBLE) {
            if (r.amount != 0) revert AmountNotZeroForIneligible(r.amount);
            settled[r.orderDigest] = true;
            emit Settled(campaignId, r.orderDigest, creator, r.eligibilityCode, 0);
            return;
        }
        if (r.eligibilityCode != Eligibility.ELIGIBLE) revert NonPayableCode(r.eligibilityCode);

        // 5. Eligible payout. Exact bound amount, one time, to the bound creator.
        uint256 amount = r.amount;
        if (amount > escrowBalance) revert InsufficientEscrow(amount, escrowBalance);

        settled[r.orderDigest] = true; // effects before interaction
        escrowBalance -= amount;
        totalSettled += amount;

        emit Settled(campaignId, r.orderDigest, creator, r.eligibilityCode, amount);
        token.safeTransfer(creator, amount);
    }

    /// @notice Merchant reclaims unspent escrow after the campaign window closes.
    ///         Locked until `campaignEnd`, and `settle` bars any result expiring
    ///         after `campaignEnd`, so the two windows never overlap and a valid
    ///         in-window result cannot be stranded. Never touches settled state or
    ///         the creator's received funds.
    function withdrawEscrow(uint256 amount) external nonReentrant {
        if (msg.sender != merchant) revert NotMerchant();
        if (block.timestamp < campaignEnd) revert EscrowLocked(campaignEnd, block.timestamp);
        if (amount > escrowBalance) revert InsufficientEscrow(amount, escrowBalance);
        escrowBalance -= amount;
        emit EscrowWithdrawn(campaignId, merchant, amount);
        token.safeTransfer(merchant, amount);
    }

    /// @notice Whether an order digest has already been settled.
    function isSettled(bytes32 orderDigest) external view returns (bool) {
        return settled[orderDigest];
    }
}
