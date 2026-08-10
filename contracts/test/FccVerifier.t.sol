// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {JorqethTestBase} from "./JorqethTestBase.sol";
import {PayableResult} from "../src/JorqethTypes.sol";
import {FccResultVerifier} from "../src/FccResultVerifier.sol";
import {MockTeeMachineRegistry} from "./mocks/MockTeeMachineRegistry.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title FCC result verifier suite
/// @notice Proves the Milestone 2 `FccResultVerifier` reconstructs the EXACT hash
///         the real Flare TEE node signs over an `ActionResult`, and accepts a
///         result only when the recovered secp256k1 signer is a currently-active
///         `teeId` for Jorqeth's extension. The signing steps below mirror the
///         pinned official sources byte-for-byte (see FccResultVerifier dev notes),
///         so a genuine tee-node signature over `abi.encode(PayableResult)` verifies
///         here unchanged. This is the swap-in that keeps `JorqethSettlement`
///         untouched.
contract FccVerifierTest is JorqethTestBase {
    bytes32 internal constant TEE_ACTION_RESULT_PREFIX = bytes32("TEE_ACTION_RESULT");
    uint256 internal constant EXTENSION_ID = 0x10000; // first public extension id

    // A stand-in TEE machine key. In a live deployment this is the Confidential
    // Space node's key; its address is the registered teeId.
    uint256 internal teePk = 0x7EE;
    address internal teeId;

    MockTeeMachineRegistry internal reg;
    FccResultVerifier internal fcc;

    // ActionResult envelope fields the extension/tee-node echo alongside Data.
    bytes32 internal constant INSTRUCTION_ID =
        0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;
    bytes internal constant SUBMISSION_TAG = bytes("end");
    uint8 internal constant STATUS_OK = 1;

    function setUp() public override {
        super.setUp();
        teeId = vm.addr(teePk);

        reg = new MockTeeMachineRegistry();
        address[] memory ids = new address[](1);
        ids[0] = teeId;
        reg.setActive(EXTENSION_ID, ids);

        fcc = new FccResultVerifier(reg, EXTENSION_ID, "simulated-attestation");
    }

    /// @notice Reproduce the exact tee-node signing preimage for a result.
    function _teeDigest(PayableResult memory r) internal view returns (bytes32) {
        bytes32 dataHash = keccak256(abi.encode(r)); // Data = abi.encode(PayableResult)
        bytes32 arHash = keccak256(
            abi.encodePacked(dataHash, INSTRUCTION_ID, keccak256(SUBMISSION_TAG), STATUS_OK)
        );
        bytes32 payload = keccak256(abi.encode(TEE_ACTION_RESULT_PREFIX, block.chainid, arHash));
        return MessageHashUtils.toEthSignedMessageHash(payload);
    }

    /// @notice Sign a result as a given TEE key and pack the FCC proof envelope.
    function _fccProof(uint256 pk, PayableResult memory r) internal view returns (bytes memory) {
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(pk, _teeDigest(r));
        bytes memory signature = abi.encodePacked(rr, s, v);
        return abi.encode(INSTRUCTION_ID, SUBMISSION_TAG, STATUS_OK, signature);
    }

    // --- Positive: a genuine active-TEE signature verifies ---

    function test_verify_acceptsActiveTeeSignature() public view {
        PayableResult memory r = eligibleResultA();
        assertTrue(fcc.verify(r, _fccProof(teePk, r)), "active teeId signature accepted");
    }

    // --- Signer not in the active set is rejected ---

    function test_verify_rejectsUnregisteredSigner() public view {
        PayableResult memory r = eligibleResultA();
        // attackerPk is a valid key but not a registered teeId.
        assertFalse(fcc.verify(r, _fccProof(attackerPk, r)), "unregistered signer rejected");
    }

    // --- Any tamper to the result breaks the bound signature ---

    function test_verify_rejectsTamperedAmount() public view {
        PayableResult memory r = eligibleResultA();
        bytes memory proof = _fccProof(teePk, r); // signed over the honest result
        r.amount = r.amount + 1; // tamper after signing
        assertFalse(fcc.verify(r, proof), "tampered amount rejected");
    }

    function test_verify_rejectsTamperedCreator() public view {
        PayableResult memory r = eligibleResultA();
        bytes memory proof = _fccProof(teePk, r);
        r.creator = address(0xDEAD);
        assertFalse(fcc.verify(r, proof), "tampered creator rejected");
    }

    // --- Tampering the envelope status/instructionId breaks recovery too ---

    function test_verify_rejectsTamperedEnvelope() public view {
        PayableResult memory r = eligibleResultA();
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(teePk, _teeDigest(r));
        bytes memory signature = abi.encodePacked(rr, s, v);
        // Re-pack with a different status than what was signed.
        bytes memory proof = abi.encode(INSTRUCTION_ID, SUBMISSION_TAG, uint8(3), signature);
        assertFalse(fcc.verify(r, proof), "tampered status rejected");
    }

    // --- Fail closed when the active TEE set is empty ---

    function test_verify_failsClosedOnEmptyRegistry() public {
        address[] memory none = new address[](0);
        reg.setActive(EXTENSION_ID, none);
        PayableResult memory r = eligibleResultA();
        vm.expectRevert(FccResultVerifier.EmptyRegistry.selector);
        fcc.verify(r, _fccProof(teePk, r));
    }

    // --- Malformed signature returns false, not revert ---

    function test_verify_rejectsGarbageSignature() public view {
        PayableResult memory r = eligibleResultA();
        bytes memory badSig = new bytes(65); // all zero
        bytes memory proof = abi.encode(INSTRUCTION_ID, SUBMISSION_TAG, STATUS_OK, badSig);
        assertFalse(fcc.verify(r, proof), "garbage signature rejected");
    }

    // --- Mode label is honest about attestation ---

    function test_mode_disclosesAttestation() public view {
        assertEq(fcc.mode(), "flare-fcc-v1/simulated-attestation", "mode discloses simulated");
    }

    function test_constructor_rejectsEmptyAttestation() public {
        vm.expectRevert(bytes("fcc: empty attestation mode"));
        new FccResultVerifier(reg, EXTENSION_ID, "");
    }

    function test_constructor_rejectsZeroRegistry() public {
        vm.expectRevert(bytes("fcc: zero registry"));
        new FccResultVerifier(ITeeMachineRegistryZero(), EXTENSION_ID, "simulated-attestation");
    }

    // --- Source-derived golden vector: the chain-id-bound payload hash matches
    //     Flare's own go-flare-common signing test byte-for-byte. ---

    /// @notice go-flare-common `pkg/signing/hash_test.go TestHash` fixes
    ///         Payload{prefix, chainId, dataHash}.Hash() for
    ///         prefix=0x1111…, chainId=14, dataHash=0x2222…. Running that exact Go
    ///         code (tee-node v0.0.24's pinned dependency) yields the constant below.
    ///         This asserts our Solidity `abi.encode(bytes32,uint256,bytes32)` payload
    ///         construction reproduces the real signer's preimage exactly, with no Go
    ///         toolchain required in CI. If this ever fails, the on-chain verifier has
    ///         drifted from the TEE signing scheme.
    function test_goldenVector_payloadHashMatchesFlareGoSource() public pure {
        bytes32 prefix = 0x1111111111111111111111111111111111111111111111111111111111111111;
        uint256 chainId = 14;
        bytes32 dataHash = 0x2222222222222222222222222222222222222222222222222222222222222222;
        bytes32 got = keccak256(abi.encode(prefix, chainId, dataHash));
        assertEq(
            got,
            0x3927cb750d24611fdfbae3ac51b1eb509321ba5dd2907fd4cd86f0198bf77f7e,
            "payload hash must match go-flare-common Payload.Hash()"
        );
    }

    /// @notice The action-result domain prefix must be the left-aligned ASCII of
    ///         "TEE_ACTION_RESULT", identical to go-flare-common
    ///         `mustStringBytes32("TEE_ACTION_RESULT")`.
    function test_goldenVector_actionResultPrefixMatchesGoSource() public pure {
        assertEq(
            TEE_ACTION_RESULT_PREFIX,
            0x5445455f414354494f4e5f524553554c54000000000000000000000000000000,
            "TEE_ACTION_RESULT prefix must match go source"
        );
    }
}

/// @dev Helper to pass address(0) as the registry without a cast warning.
function ITeeMachineRegistryZero() pure returns (MockTeeMachineRegistry) {
    return MockTeeMachineRegistry(address(0));
}
