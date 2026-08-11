package main

import (
	"bytes"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/flare-foundation/go-flare-common/pkg/tee/instruction"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"
)

func TestOfficialActionLifecycle(t *testing.T) {
	ext, err := newExtension(`[{"orderReference":"private-order-1","netAmount":"1000050","refunded":false}]`)
	if err != nil {
		t.Fatal(err)
	}
	digest := crypto.Keccak256Hash([]byte("private-order-1"))
	fixed := instruction.DataFixed{
		InstructionID:   common.HexToHash("0x1234"),
		OPType:          teeutils.ToHash(opType),
		OPCommand:       teeutils.ToHash(opCommand),
		OriginalMessage: jsonBytes(testRequest(digest)),
	}
	fixedJSON, err := json.Marshal(fixed)
	if err != nil {
		t.Fatal(err)
	}
	action := teetypes.Action{Data: teetypes.ActionData{
		ID:      common.HexToHash("0x5678"),
		Message: fixedJSON,
	}}
	actionJSON, err := json.Marshal(action)
	if err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodPost, "/action", bytes.NewReader(actionJSON))
	response := httptest.NewRecorder()
	ext.handleAction(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}

	var result teetypes.ActionResult
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Status != 1 || result.Log != "ok" {
		t.Fatalf("result status = %d, log = %q", result.Status, result.Log)
	}
	if result.ID != action.Data.ID || result.OPType != fixed.OPType || result.OPCommand != fixed.OPCommand {
		t.Fatal("official action bindings were not preserved")
	}
	amount := new(big.Int).SetBytes(result.Data[4*32 : 5*32])
	if amount.Cmp(big.NewInt(200010)) != 0 {
		t.Fatalf("amount = %s", amount)
	}
}

func TestEvaluateEligibleUsesFloorCommission(t *testing.T) {
	ext, err := newExtension(`[{"orderReference":"private-order-1","netAmount":"1000050","refunded":false}]`)
	if err != nil {
		t.Fatal(err)
	}
	digest := crypto.Keccak256Hash([]byte("private-order-1"))
	request := testRequest(digest)
	data, err := ext.evaluate(jsonBytes(request))
	if err != nil {
		t.Fatal(err)
	}
	if len(data) != 12*32 {
		t.Fatalf("encoded result length = %d", len(data))
	}
	amount := new(big.Int).SetBytes(data[4*32 : 5*32])
	if amount.Cmp(big.NewInt(200010)) != 0 {
		t.Fatalf("amount = %s", amount)
	}
	if new(big.Int).SetBytes(data[5*32:6*32]).Uint64() != 1 {
		t.Fatal("expected eligible code")
	}
}

func TestEvaluateRefundedPaysZero(t *testing.T) {
	ext, _ := newExtension(`[{"orderReference":"private-order-1","netAmount":"1000050","refunded":true}]`)
	data, err := ext.evaluate(jsonBytes(testRequest(crypto.Keccak256Hash([]byte("private-order-1")))))
	if err != nil {
		t.Fatal(err)
	}
	if new(big.Int).SetBytes(data[4*32:5*32]).Sign() != 0 {
		t.Fatal("refunded result paid a commission")
	}
	if new(big.Int).SetBytes(data[5*32:6*32]).Sign() != 0 {
		t.Fatal("refunded result was eligible")
	}
}

func TestPrivateReferenceNeverAppearsInResult(t *testing.T) {
	ext, _ := newExtension(`[{"orderReference":"private-order-1","netAmount":"1000050","refunded":false}]`)
	data, err := ext.evaluate(jsonBytes(testRequest(crypto.Keccak256Hash([]byte("private-order-1")))))
	if err != nil {
		t.Fatal(err)
	}
	if string(data) == "private-order-1" || contains(data, []byte("private-order-1")) {
		t.Fatal("raw private reference leaked")
	}
}

func testRequest(digest common.Hash) evaluationRequest {
	return evaluationRequest{
		SchemaVersion: 1, CampaignID: common.HexToHash("0x01").Hex(), OrderDigest: digest.Hex(),
		Creator: "0x1111111111111111111111111111111111111111", CommissionBPS: 2000,
		ChainID: 114, SettlementContract: "0x2222222222222222222222222222222222222222",
		RuleVersion: common.HexToHash("0x02").Hex(), Nonce: common.HexToHash("0x03").Hex(),
		IssuedAt: 100, Expiry: 200,
	}
}

func jsonBytes(value any) []byte {
	b, _ := json.Marshal(value)
	return b
}

func contains(data, needle []byte) bool {
	for i := 0; i+len(needle) <= len(data); i++ {
		if string(data[i:i+len(needle)]) == string(needle) {
			return true
		}
	}
	return false
}
