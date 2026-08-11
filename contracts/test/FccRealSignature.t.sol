// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PayableResult} from "../src/JorqethTypes.sol";
import {FccResultVerifier} from "../src/FccResultVerifier.sol";
import {MockTeeMachineRegistry} from "./mocks/MockTeeMachineRegistry.sol";

/// @title Genuine Flare TEE-node signature acceptance
/// @notice A signature-format compatibility check without provisioning
///         Flare's private e2e devnet: a signature minted by the REAL, pinned Flare
///         library code (tee-node v0.0.24 + go-flare-common) over
///         `abi.encode(PayableResult)` is accepted by `FccResultVerifier` with zero
///         changes to `JorqethSettlement`.
///
///         The vector below is emitted by `tools/tee-signer` (a Go driver that
///         reproduces `internal/router.SignResult` line-for-line using the pinned
///         public primitives `teetypes.ActionResult.Hash()`,
///         `csigning.NewPayload(...).Hash()`, and `teeutils.Sign(...)`). To regenerate:
///         `go run ./cmd/jorqeth-sign` in the pinned fce-extension-scaffold module.
///
///         Because it is a captured local compatibility signature, this suite
///         exercises the two off-chain-tooling landmines a mock `vm.sign` hides:
///           1. go-ethereum `crypto.Sign` emits v in {0,1}; OZ ECDSA needs {27,28}.
///              The submitting relayer applies the standard +27 (r,s untouched).
///           2. The signature is bound to the signer's configured CHAIN_ID (31337 for
///              the local devnet); it verifies only on a matching chain.
contract FccRealSignatureTest is Test {
    uint256 internal constant EXTENSION_ID = 0x10000;

    // --- Captured compatibility vector (tools/tee-signer output) ---
    uint256 internal constant CAP_CHAIN_ID = 31337; // tee-node CHAIN_ID (local devnet)
    address internal constant CAP_TEE_ID = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    bytes32 internal constant CAP_INSTRUCTION_ID =
        0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;
    uint8 internal constant CAP_STATUS = 1;

    // Data = abi.encode(PayableResult), exactly 12 static words (384 bytes),
    // produced by go-ethereum abi.Arguments.Pack in the driver.
    bytes internal constant CAP_DATA = hex"0000000000000000000000000000000000000000000000000000000000000001"
        hex"cbd0f075e08709f2fd3f28132cb9496eecfcac785276e84c16b0d8e475b4c99a"
        hex"be4b0fa03136646a52108527f8dd4873c60796d246fe5dd610ec0d4a2f6a1a45"
        hex"000000000000000000000000000000000000000000000000000000000000c0de"
        hex"0000000000000000000000000000000000000000000000000000000001312d00"
        hex"0000000000000000000000000000000000000000000000000000000000000001"
        hex"0000000000000000000000000000000000000000000000000000000000007a69"
        hex"00000000000000000000000000000000000000000000000000000000dec0de01"
        hex"a865c645c1901fa821cc0ea91db46d39b4cfe7e81f927863d51387ab8c947a4d"
        hex"2eb12bba2aabbb88533ac6c328a0a0fb0641940ca57c13fb675bf3c4b9f358ef"
        hex"0000000000000000000000000000000000000000000000000000000068e77800"
        hex"0000000000000000000000000000000000000000000000000000000068e78610";

    // Genuine tee-node signature, r||s||v with v normalized to 28 (0x1c) for on-chain use.
    bytes internal constant CAP_SIG_V2728 = hex"9717c77497e3dc0669df3303d7b00a0d1e7b851c53062f830a9519cf9ac82ce4"
        hex"3133a0a3537818352976b85da785a9ba427af9d30f87768971b62f6e475a2e53" hex"1c";

    // The same signature exactly as go-ethereum emits it, v in {0,1} (0x01).
    bytes internal constant CAP_SIG_RAW_V01 = hex"9717c77497e3dc0669df3303d7b00a0d1e7b851c53062f830a9519cf9ac82ce4"
        hex"3133a0a3537818352976b85da785a9ba427af9d30f87768971b62f6e475a2e53" hex"01";

    // Intermediate hashes captured from the pinned Flare libraries, asserted below.
    bytes32 internal constant CAP_AR_HASH =
        0x861b0e993d7779fea44841a33f6fe23616f8af6aede34325a38f9ee876de3ec1;
    bytes32 internal constant CAP_PAYLOAD_HASH =
        0xf1b28c36b0902c7e57697e2c794d5417d6e30e8a38d4893929c48092fb8b3861;

    bytes32 internal constant TEE_ACTION_RESULT_PREFIX = bytes32("TEE_ACTION_RESULT");

    MockTeeMachineRegistry internal reg;
    FccResultVerifier internal fcc;

    function setUp() public {
        vm.chainId(CAP_CHAIN_ID); // match the chain the tee-node signed for

        reg = new MockTeeMachineRegistry();
        address[] memory ids = new address[](1);
        ids[0] = CAP_TEE_ID;
        reg.setActive(EXTENSION_ID, ids);

        fcc = new FccResultVerifier(reg, EXTENSION_ID, "simulated-attestation");
    }

    /// @dev Rebuild the exact struct the Go driver signed, from constants.
    function capturedResult() internal pure returns (PayableResult memory r) {
        r = PayableResult({
            schemaVersion: 1,
            campaignId: 0xcbd0f075e08709f2fd3f28132cb9496eecfcac785276e84c16b0d8e475b4c99a,
            orderDigest: 0xbe4b0fa03136646a52108527f8dd4873c60796d246fe5dd610ec0d4a2f6a1a45,
            creator: 0x000000000000000000000000000000000000c0DE,
            amount: 20_000000,
            eligibilityCode: 1,
            chainId: 31337,
            settlementContract: 0x00000000000000000000000000000000Dec0dE01,
            ruleVersion: 0xa865c645c1901fa821cc0ea91db46d39b4cfe7e81f927863d51387ab8c947a4d,
            nonce: 0x2eb12bba2aabbb88533ac6c328a0a0fb0641940ca57c13fb675bf3c4b9f358ef,
            issuedAt: 1_760_000_000,
            expiry: 1_760_003_600
        });
    }

    function _proof(bytes memory sig) internal pure returns (bytes memory) {
        return abi.encode(CAP_INSTRUCTION_ID, bytes("end"), CAP_STATUS, sig);
    }

    // --- 1. Cross-language ABI equality: Solidity abi.encode == Go abi.encode ---

    function test_realSig_solidityEncodingMatchesGo() public pure {
        assertEq(
            abi.encode(capturedResult()),
            CAP_DATA,
            "Solidity abi.encode(result) must equal the Go-produced Data byte-for-byte"
        );
    }

    // --- 2. The digest chain reconstructs the captured compatibility hashes ---

    function test_realSig_hashChainMatchesGenuine() public view {
        bytes32 dataHash = keccak256(abi.encode(capturedResult()));
        assertEq(dataHash, keccak256(CAP_DATA), "dataHash consistent");
        bytes32 arHash = keccak256(
            abi.encodePacked(dataHash, CAP_INSTRUCTION_ID, keccak256(bytes("end")), CAP_STATUS)
        );
        assertEq(arHash, CAP_AR_HASH, "arHash matches tee-node ActionResult.Hash()");
        bytes32 payload = keccak256(abi.encode(TEE_ACTION_RESULT_PREFIX, block.chainid, arHash));
        assertEq(payload, CAP_PAYLOAD_HASH, "payload matches go-flare-common Payload.Hash()");
    }

    // --- 3. The local compatibility signature verifies unchanged ---

    function test_realSig_verifierAcceptsGenuineSignature() public view {
        assertTrue(
            fcc.verify(capturedResult(), _proof(CAP_SIG_V2728)),
            "a pinned-library compatibility signature is accepted"
        );
    }

    // --- 4. The +27 landmine: raw v-in-{0,1} is rejected until normalized ---

    function test_realSig_rawV01Rejected() public view {
        assertFalse(
            fcc.verify(capturedResult(), _proof(CAP_SIG_RAW_V01)),
            "raw go-ethereum v must be +27 normalized before on-chain verify"
        );
    }

    // --- 5. chainId binding: the same signature fails on a different chain ---

    function test_realSig_wrongChainRejected() public {
        vm.chainId(114); // Coston2, not the 31337 the node signed for
        assertFalse(
            fcc.verify(capturedResult(), _proof(CAP_SIG_V2728)),
            "signature is bound to the signer's CHAIN_ID"
        );
    }

    // --- 6. Tamper: any change to the signed result breaks recovery ---

    function test_realSig_tamperedAmountRejected() public view {
        PayableResult memory r = capturedResult();
        r.amount += 1;
        assertFalse(fcc.verify(r, _proof(CAP_SIG_V2728)), "tampered amount rejected");
    }

    // --- 7. The signer the verifier recovers is exactly the registered teeId ---

    function test_realSig_signerIsRegisteredTeeId() public {
        // Remove the real teeId; with only a decoy active, the same signature must fail,
        // proving acceptance in test 3 hinged on recovering CAP_TEE_ID specifically.
        address[] memory decoy = new address[](1);
        decoy[0] = address(0xBEEF);
        reg.setActive(EXTENSION_ID, decoy);
        assertFalse(
            fcc.verify(capturedResult(), _proof(CAP_SIG_V2728)),
            "acceptance requires the recovered signer to be the registered teeId"
        );
    }
}
