// Command jorqeth-sign generates a deterministic Flare ActionResult signature
// compatibility vector over a Jorqeth PayableResult. It uses the real, pinned Flare
// library primitives for ActionResult hashing, payload construction, and EIP-191
// signing, then emits values consumed by contracts/test/FccRealSignature.t.sol.
//
// This proves signature-format compatibility. It does NOT prove that a TEE executed
// Jorqeth, that a machine was registered on Coston2, or that production attestation
// occurred. The signer is the well-known public Anvil account-0 development key.
//
// Run with `go run .`. See README.md for the exact scope and provenance.
package main

import (
	"encoding/json"
	"fmt"
	"math/big"
	"os"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"

	csigning "github.com/flare-foundation/go-flare-common/pkg/signing"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"
)

// PayableResult mirrors contracts/src/JorqethTypes.sol byte-for-byte. Field order
// and ABI types must match exactly, or abi.encode(result) diverges from Solidity.
type PayableResult struct {
	SchemaVersion      uint16
	CampaignId         [32]byte
	OrderDigest        [32]byte
	Creator            common.Address
	Amount             *big.Int
	EligibilityCode    uint8
	ChainId            *big.Int
	SettlementContract common.Address
	RuleVersion        [32]byte
	Nonce              [32]byte
	IssuedAt           uint64
	Expiry             uint64
}

func payableResultArguments() abi.Arguments {
	tupleType, err := abi.NewType("tuple", "", []abi.ArgumentMarshaling{
		{Name: "schemaVersion", Type: "uint16"},
		{Name: "campaignId", Type: "bytes32"},
		{Name: "orderDigest", Type: "bytes32"},
		{Name: "creator", Type: "address"},
		{Name: "amount", Type: "uint256"},
		{Name: "eligibilityCode", Type: "uint8"},
		{Name: "chainId", Type: "uint256"},
		{Name: "settlementContract", Type: "address"},
		{Name: "ruleVersion", Type: "bytes32"},
		{Name: "nonce", Type: "bytes32"},
		{Name: "issuedAt", Type: "uint64"},
		{Name: "expiry", Type: "uint64"},
	})
	if err != nil {
		panic(err)
	}
	return abi.Arguments{{Type: tupleType}}
}

func h32(s string) [32]byte {
	var out [32]byte
	copy(out[:], common.HexToHash(s).Bytes())
	return out
}

func must[T any](v T, err error) T {
	if err != nil {
		panic(err)
	}
	return v
}

func main() {
	// Well-known PUBLIC Anvil account-0 test key. It is shared by Foundry installs,
	// must never hold real funds, and is used here only for deterministic test data.
	const teeKeyHex = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	key := must(crypto.HexToECDSA(teeKeyHex))
	teeId := crypto.PubkeyToAddress(key.PublicKey)

	const chainID = uint64(31337)
	result := PayableResult{
		SchemaVersion:      1,
		CampaignId:         h32("0xcbd0f075e08709f2fd3f28132cb9496eecfcac785276e84c16b0d8e475b4c99a"),
		OrderDigest:        h32("0xbe4b0fa03136646a52108527f8dd4873c60796d246fe5dd610ec0d4a2f6a1a45"),
		Creator:            common.HexToAddress("0x000000000000000000000000000000000000C0DE"),
		Amount:             big.NewInt(20_000000),
		EligibilityCode:    1,
		ChainId:            new(big.Int).SetUint64(chainID),
		SettlementContract: common.HexToAddress("0x00000000000000000000000000000000DeC0DE01"),
		RuleVersion:        h32("0xa865c645c1901fa821cc0ea91db46d39b4cfe7e81f927863d51387ab8c947a4d"),
		Nonce:              h32("0x2eb12bba2aabbb88533ac6c328a0a0fb0641940ca57c13fb675bf3c4b9f358ef"),
		IssuedAt:           1_760_000_000,
		Expiry:             1_760_003_600,
	}

	// Data = abi.encode(PayableResult). All 12 fields are static, so the payload is
	// 384 bytes and must be byte-identical to Solidity abi.encode(result).
	data := must(payableResultArguments().Pack(result))
	if len(data) != 12*32 {
		panic(fmt.Sprintf("expected 384-byte Data, got %d", len(data)))
	}

	// Reproduce the pinned Flare public primitives used by the ActionResult signing
	// path. This executes locally with the deterministic Anvil key above.
	instructionID := common.HexToHash("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef")
	ar := &teetypes.ActionResult{
		ID:            instructionID,
		SubmissionTag: teetypes.End,
		Status:        1,
		Data:          data,
	}
	arHash := ar.Hash()
	payload := must(csigning.NewPayload(csigning.TEEActionResult, chainID, common.BytesToHash(arHash)).Hash())
	sig := must(teeutils.Sign(payload[:], key))

	if err := teeutils.VerifySignature(payload[:], sig, teeId); err != nil {
		panic(fmt.Sprintf("library self-verify failed: %v", err))
	}

	// OpenZeppelin ECDSA expects v in {27,28}; go-ethereum crypto.Sign emits {0,1}.
	sig27 := make([]byte, 65)
	copy(sig27, sig)
	sig27[64] = sig[64] + 27

	out := map[string]any{
		"note":               "Flare ActionResult signature-format compatibility vector generated locally with pinned Flare libraries and the public Anvil test key.",
		"teeKeyHex":          teeKeyHex,
		"teeId":              teeId.Hex(),
		"chainId":            chainID,
		"instructionId":      instructionID.Hex(),
		"submissionTag":      string(teetypes.End),
		"status":             ar.Status,
		"data":               hexutil.Encode(data),
		"dataHash":           hexutil.Encode(crypto.Keccak256(data)),
		"arHash":             hexutil.Encode(arHash),
		"payloadHash":        hexutil.Encode(payload[:]),
		"signatureRaw_v01":   hexutil.Encode(sig),
		"signature_v2728":    hexutil.Encode(sig27),
		"result": map[string]any{
			"schemaVersion":      result.SchemaVersion,
			"campaignId":         hexutil.Encode(result.CampaignId[:]),
			"orderDigest":        hexutil.Encode(result.OrderDigest[:]),
			"creator":            result.Creator.Hex(),
			"amount":             result.Amount.String(),
			"eligibilityCode":    result.EligibilityCode,
			"chainId":            result.ChainId.String(),
			"settlementContract": result.SettlementContract.Hex(),
			"ruleVersion":        hexutil.Encode(result.RuleVersion[:]),
			"nonce":              hexutil.Encode(result.Nonce[:]),
			"issuedAt":           result.IssuedAt,
			"expiry":             result.Expiry,
		},
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(out); err != nil {
		panic(err)
	}
}
