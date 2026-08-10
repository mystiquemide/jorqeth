// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PayableResult} from "../src/JorqethTypes.sol";
import {JorqethResult} from "../src/JorqethResult.sol";
import {JorqethSettlement} from "../src/JorqethSettlement.sol";
import {SignatureResultVerifier} from "../src/SignatureResultVerifier.sol";
import {MockUSD} from "../src/MockUSD.sol";

/// @title Shared Jorqeth test harness
/// @notice Sets up token, verifier, settlement, actors, and EIP-712 signing helpers
///         mirroring the frozen spec so every test builds results the same way the
///         confidential evaluator would.
abstract contract JorqethTestBase is Test {
    using JorqethResult for PayableResult;

    // Frozen spec constants (see spec/jorqeth-v1.json).
    uint16 internal constant SCHEMA_VERSION = 1;
    bytes32 internal constant CAMPAIGN_ID =
        0xcbd0f075e08709f2fd3f28132cb9496eecfcac785276e84c16b0d8e475b4c99a;
    bytes32 internal constant RULE_VERSION =
        0xa865c645c1901fa821cc0ea91db46d39b4cfe7e81f927863d51387ab8c947a4d;
    uint16 internal constant COMMISSION_BPS = 1000;
    uint256 internal constant ESCROW_AMOUNT = 100_000000; // 100.000000 mUSD

    bytes32 internal constant ORDER_A =
        0xbe4b0fa03136646a52108527f8dd4873c60796d246fe5dd610ec0d4a2f6a1a45;
    bytes32 internal constant ORDER_B =
        0x2211acb1c6f286f7f78d0540520ff45e6b53701156d05e1951bb85bbfefff065;
    bytes32 internal constant ORDER_C =
        0x5739f03e7db113339cc4be123cbb055d3dcb549923fd291f390ef6e9bfd7b9c3;

    bytes32 internal constant NONCE_A =
        0x2eb12bba2aabbb88533ac6c328a0a0fb0641940ca57c13fb675bf3c4b9f358ef;
    bytes32 internal constant NONCE_B =
        0x351b4fa63e15d300c8b5cb1298987b117fb461c8a427f5a9c2a63678d8013e0b;
    bytes32 internal constant NONCE_C =
        0xe40456bb79e47a47b96f66e84b3f298161d17c2db0661f300a6270b29315c6cd;

    uint256 internal constant NET_A = 200_000000;
    uint256 internal constant COMMISSION_A = 20_000000; // floor(200e6 * 1000 / 10000)

    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant NAME_HASH = keccak256("Jorqeth");
    bytes32 private constant VERSION_HASH = keccak256("1");

    // Actors
    uint256 internal signerPk = 0xA11CE;
    address internal trustedSigner;
    uint256 internal attackerPk = 0xBAD;
    address internal merchant;
    address internal creator;

    MockUSD internal token;
    SignatureResultVerifier internal verifier;
    JorqethSettlement internal settlement;

    function setUp() public virtual {
        trustedSigner = vm.addr(signerPk);
        merchant = makeAddr("merchant");
        creator = makeAddr("creator");

        token = new MockUSD();
        verifier = new SignatureResultVerifier(trustedSigner);
        settlement = new JorqethSettlement(
            token,
            verifier,
            SCHEMA_VERSION,
            CAMPAIGN_ID,
            merchant,
            creator,
            COMMISSION_BPS,
            RULE_VERSION
        );

        // Warp to a realistic timestamp so issuedAt/expiry windows are meaningful.
        vm.warp(1_760_000_000);

        // Fund escrow as the merchant.
        token.mint(merchant, ESCROW_AMOUNT);
        vm.startPrank(merchant);
        token.approve(address(settlement), ESCROW_AMOUNT);
        settlement.fund(ESCROW_AMOUNT);
        vm.stopPrank();
    }

    // --- Result builders ---

    /// @notice A well-formed eligible result for ORDER-A bound to this deployment.
    function eligibleResultA() internal view returns (PayableResult memory r) {
        r = PayableResult({
            schemaVersion: SCHEMA_VERSION,
            campaignId: CAMPAIGN_ID,
            orderDigest: ORDER_A,
            creator: creator,
            amount: COMMISSION_A,
            eligibilityCode: 1,
            chainId: block.chainid,
            settlementContract: address(settlement),
            ruleVersion: RULE_VERSION,
            nonce: NONCE_A,
            issuedAt: uint64(block.timestamp),
            expiry: uint64(block.timestamp + 1 hours)
        });
    }

    /// @notice A well-formed refunded (ineligible, zero) result for ORDER-B.
    function ineligibleResultB() internal view returns (PayableResult memory r) {
        r = eligibleResultA();
        r.orderDigest = ORDER_B;
        r.amount = 0;
        r.eligibilityCode = 0;
        r.nonce = NONCE_B;
    }

    // --- Signing ---

    function domainSeparator(uint256 chainId, address verifyingContract)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, chainId, verifyingContract)
        );
    }

    /// @notice Sign a result with an arbitrary key, using the result's own declared
    ///         domain (chainId + settlementContract) as the EIP-712 domain.
    function signWith(uint256 pk, PayableResult memory r) internal pure returns (bytes memory) {
        bytes32 ds = domainSeparator(r.chainId, r.settlementContract);
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", ds, r.hashStruct()));
        (uint8 v, bytes32 s, bytes32 rr) = _vrs(pk, digest);
        return abi.encodePacked(rr, s, v);
    }

    /// @notice Sign a result with the trusted evaluator key.
    function sign(PayableResult memory r) internal view returns (bytes memory) {
        return signWith(signerPk, r);
    }

    function _vrs(uint256 pk, bytes32 digest) private pure returns (uint8 v, bytes32 s, bytes32 r) {
        (v, r, s) = vm.sign(pk, digest);
    }
}
