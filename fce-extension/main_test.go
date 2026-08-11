package main

import (
	"encoding/hex"
	"encoding/json"
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

func TestEvaluateEligibleUsesFloorCommission(t *testing.T) {
	ext, err := newExtension(`[{"orderReference":"private-order-1","netAmount":"1000050","refunded":false}]`)
	if err != nil {
		t.Fatal(err)
	}
	digest := crypto.Keccak256Hash([]byte("private-order-1"))
	request := testRequest(digest)
	data, err := ext.evaluate(hexJSON(request))
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
	data, err := ext.evaluate(hexJSON(testRequest(crypto.Keccak256Hash([]byte("private-order-1")))))
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
	data, err := ext.evaluate(hexJSON(testRequest(crypto.Keccak256Hash([]byte("private-order-1")))))
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

func hexJSON(value any) string {
	b, _ := json.Marshal(value)
	return "0x" + hex.EncodeToString(b)
}

func contains(data, needle []byte) bool {
	for i := 0; i+len(needle) <= len(data); i++ {
		if string(data[i:i+len(needle)]) == string(needle) {
			return true
		}
	}
	return false
}
