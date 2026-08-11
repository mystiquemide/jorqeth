package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/flare-foundation/go-flare-common/pkg/tee/instruction"
	"github.com/flare-foundation/tee-node/pkg/processorutils"
	teeserver "github.com/flare-foundation/tee-node/pkg/server"
	teetypes "github.com/flare-foundation/tee-node/pkg/types"
	teeutils "github.com/flare-foundation/tee-node/pkg/utils"
)

const (
	version   = "0.2.0"
	opType    = "COMMISSION"
	opCommand = "EVALUATE"
)

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

	configPort := intEnv("CONFIG_PORT", 5501)
	signPort := intEnv("SIGN_PORT", 7701)
	extensionPort := intEnv("EXTENSION_PORT", 7702)

	go teeserver.StartServerExtension(configPort, signPort, extensionPort)

	mux := http.NewServeMux()
	mux.HandleFunc("POST /action", ext.handleAction)
	mux.HandleFunc("GET /state", ext.handleState)
	server := &http.Server{Addr: fmt.Sprintf(":%d", extensionPort), Handler: mux}
	errCh := make(chan error, 1)
	go func() { errCh <- server.ListenAndServe() }()

	log.Printf("Jorqeth FCE TEE running (config=%d sign=%d extension=%d)", configPort, signPort, extensionPort)
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	select {
	case <-signals:
		return
	case err := <-errCh:
		log.Fatal(err)
	}
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
		"stateVersion": teeutils.ToHash(version),
		"state":        map[string]any{"recordCount": len(e.records)},
	})
}

func (e *extension) handleAction(w http.ResponseWriter, r *http.Request) {
	var action teetypes.Action
	if err := json.NewDecoder(r.Body).Decode(&action); err != nil {
		http.Error(w, fmt.Sprintf("decoding action: %v", err), http.StatusBadRequest)
		return
	}

	dataFixed, err := processorutils.Parse[instruction.DataFixed](action.Data.Message)
	if err != nil {
		http.Error(w, fmt.Sprintf("decoding fixed data: %v", err), http.StatusBadRequest)
		return
	}
	if dataFixed.OPType != teeutils.ToHash(opType) || dataFixed.OPCommand != teeutils.ToHash(opCommand) {
		http.Error(w, "unsupported operation", http.StatusNotImplemented)
		return
	}

	result := teetypes.ActionResult{
		ID:            action.Data.ID,
		SubmissionTag: action.Data.SubmissionTag,
		Version:       version,
		OPType:        dataFixed.OPType,
		OPCommand:     dataFixed.OPCommand,
	}
	data, err := e.evaluate(dataFixed.OriginalMessage)
	if err != nil {
		result.Status = 0
		result.Log = "error: " + err.Error()
	} else {
		result.Status = 1
		result.Log = "ok"
		result.Data = data
	}
	writeJSON(w, http.StatusOK, result)
}

func (e *extension) evaluate(raw []byte) ([]byte, error) {
	var req evaluationRequest
	dec := json.NewDecoder(bytes.NewReader(raw))
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

func intEnv(name string, fallback int) int {
	value, err := strconv.Atoi(os.Getenv(name))
	if err != nil {
		return fallback
	}
	return value
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
