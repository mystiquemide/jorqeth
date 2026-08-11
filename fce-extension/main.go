package main

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

const (
	version   = "0.1.0"
	opType    = "COMMISSION"
	opCommand = "EVALUATE"
)

type action struct {
	Data actionData `json:"data"`
}

type actionData struct {
	ID            string `json:"id"`
	SubmissionTag string `json:"submissionTag"`
	Message       string `json:"message"`
}

type dataFixed struct {
	OPType          string `json:"opType"`
	OPCommand       string `json:"opCommand"`
	OriginalMessage string `json:"originalMessage"`
}

type actionResult struct {
	ID                     string `json:"id"`
	SubmissionTag          string `json:"submissionTag"`
	Status                 uint8  `json:"status"`
	Log                    string `json:"log"`
	OPType                 string `json:"opType"`
	OPCommand              string `json:"opCommand"`
	AdditionalResultStatus string `json:"additionalResultStatus"`
	Version                string `json:"version"`
	Data                   string `json:"data"`
}

type evaluationRequest struct {
	SchemaVersion      uint16 `json:"schemaVersion"`
	CampaignID         string `json:"campaignId"`
	OrderDigest        string `json:"orderDigest"`
	Creator            string `json:"creator"`
	CommissionBPS      uint16 `json:"commissionBps"`
	ChainID            uint64 `json:"chainId"`
	SettlementContract string `json:"settlementContract"`
	RuleVersion        string `json:"ruleVersion"`
	Nonce              string `json:"nonce"`
	IssuedAt           uint64 `json:"issuedAt"`
	Expiry             uint64 `json:"expiry"`
}

type privateRecord struct {
	OrderReference string `json:"orderReference"`
	NetAmount      string `json:"netAmount"`
	Refunded       bool   `json:"refunded"`
}

type payableResult struct {
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

type extension struct {
	records map[common.Hash]privateRecord
}

func main() {
	ext, err := newExtension(os.Getenv("JORQETH_PRIVATE_RECORDS"))
	if err != nil {
		log.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /action", ext.handleAction)
	mux.HandleFunc("GET /state", ext.handleState)
	addr := ":7702"
	if port := os.Getenv("EXTENSION_PORT"); port != "" {
		addr = ":" + port
	}
	log.Printf("Jorqeth FCE extension listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func newExtension(raw string) (*extension, error) {
	var rows []privateRecord
	if raw != "" {
		if err := json.Unmarshal([]byte(raw), &rows); err != nil {
			return nil, fmt.Errorf("decode JORQETH_PRIVATE_RECORDS: %w", err)
		}
	}
	records := make(map[common.Hash]privateRecord, len(rows))
	for _, row := range rows {
		if row.OrderReference == "" {
			return nil, errors.New("private record has empty orderReference")
		}
		records[crypto.Keccak256Hash([]byte(row.OrderReference))] = row
	}
	return &extension{records: records}, nil
}

func (e *extension) handleState(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"stateVersion": bytes32Hex(version),
		"state":        map[string]any{"recordCount": len(e.records)},
	})
}

func (e *extension) handleAction(w http.ResponseWriter, r *http.Request) {
	var a action
	if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
		http.Error(w, "invalid action", http.StatusBadRequest)
		return
	}
	dfBytes, err := decodeHex(a.Data.Message)
	if err != nil {
		http.Error(w, "invalid DataFixed hex", http.StatusBadRequest)
		return
	}
	var df dataFixed
	if err := json.Unmarshal(dfBytes, &df); err != nil {
		http.Error(w, "invalid DataFixed JSON", http.StatusBadRequest)
		return
	}
	if !equalBytes32(df.OPType, opType) || !equalBytes32(df.OPCommand, opCommand) {
		http.Error(w, "unsupported operation", http.StatusNotImplemented)
		return
	}

	result := actionResult{
		ID: a.Data.ID, SubmissionTag: a.Data.SubmissionTag, OPType: df.OPType,
		OPCommand: df.OPCommand, AdditionalResultStatus: "0x", Version: version,
	}
	data, err := e.evaluate(df.OriginalMessage)
	if err != nil {
		result.Status, result.Log, result.Data = 0, "error: "+err.Error(), "0x"
	} else {
		result.Status, result.Log, result.Data = 1, "ok", "0x"+hex.EncodeToString(data)
	}
	writeJSON(w, http.StatusOK, result)
}

func (e *extension) evaluate(message string) ([]byte, error) {
	raw, err := decodeHex(message)
	if err != nil {
		return nil, errors.New("invalid evaluation message hex")
	}
	var req evaluationRequest
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		return nil, fmt.Errorf("invalid evaluation request: %w", err)
	}
	if req.CommissionBPS > 10_000 {
		return nil, errors.New("commissionBps exceeds 10000")
	}
	orderDigest := common.HexToHash(req.OrderDigest)
	record, found := e.records[orderDigest]
	amount := new(big.Int)
	eligibility := uint8(0)
	if found && !record.Refunded {
		netAmount, ok := new(big.Int).SetString(record.NetAmount, 10)
		if !ok || netAmount.Sign() < 0 {
			return nil, errors.New("private record has invalid netAmount")
		}
		amount.Mul(netAmount, new(big.Int).SetUint64(uint64(req.CommissionBPS)))
		amount.Div(amount, big.NewInt(10_000))
		eligibility = 1
	}

	result := payableResult{
		SchemaVersion: req.SchemaVersion, CampaignId: common.HexToHash(req.CampaignID),
		OrderDigest: orderDigest, Creator: common.HexToAddress(req.Creator), Amount: amount,
		EligibilityCode: eligibility, ChainId: new(big.Int).SetUint64(req.ChainID),
		SettlementContract: common.HexToAddress(req.SettlementContract),
		RuleVersion:        common.HexToHash(req.RuleVersion), Nonce: common.HexToHash(req.Nonce),
		IssuedAt: req.IssuedAt, Expiry: req.Expiry,
	}
	return encodePayableResult(result)
}

func encodePayableResult(result payableResult) ([]byte, error) {
	tuple, err := abi.NewType("tuple", "", []abi.ArgumentMarshaling{
		{Name: "schemaVersion", Type: "uint16"}, {Name: "campaignId", Type: "bytes32"},
		{Name: "orderDigest", Type: "bytes32"}, {Name: "creator", Type: "address"},
		{Name: "amount", Type: "uint256"}, {Name: "eligibilityCode", Type: "uint8"},
		{Name: "chainId", Type: "uint256"}, {Name: "settlementContract", Type: "address"},
		{Name: "ruleVersion", Type: "bytes32"}, {Name: "nonce", Type: "bytes32"},
		{Name: "issuedAt", Type: "uint64"}, {Name: "expiry", Type: "uint64"},
	})
	if err != nil {
		return nil, err
	}
	return abi.Arguments{{Type: tuple}}.Pack(result)
}

func decodeHex(value string) ([]byte, error) {
	return hex.DecodeString(strings.TrimPrefix(value, "0x"))
}

func bytes32Hex(value string) string {
	var out [32]byte
	copy(out[:], value)
	return "0x" + hex.EncodeToString(out[:])
}

func equalBytes32(encoded, plain string) bool {
	return strings.EqualFold(encoded, bytes32Hex(plain))
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
