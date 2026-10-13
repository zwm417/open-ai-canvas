package license

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const (
	DefaultActivationServer   = "https://license.zhitianxia-ai.com"
	DefaultDevActivationCode  = "auto-example-123456"
	RemoteActivatePath        = "/rpc/activateUsage"
	RemoteCheckPath           = "/rpc/judgeProductAbnormality"
	CategoryMediaLab          = 1 // 智影创作 (media-lab)
	CategoryAllInOne          = 99 // OPC 全家桶套件 (全通)
)

var successCodes = map[string]bool{
	"SC":      true,
	"SUCCESS": true,
	"OK":      true,
	"0":       true,
	"200":     true,
}

// RemoteActivationResult 远程鉴权中心返回的统一业务结果
type RemoteActivationResult struct {
	OK             bool           `json:"ok"`
	Code           string         `json:"code"`
	Message        string         `json:"message"`
	Tier           string         `json:"tier"`
	ExpiresAt      *time.Time     `json:"expiresAt"`
	InitialCredits int64          `json:"initialCredits"`
	MaxDevices     int            `json:"maxDevices"`
	RawPayload     map[string]any `json:"rawPayload"`
}

type Client struct {
	ServerURL  string
	HTTPClient *http.Client
}

func NewClient() *Client {
	server := strings.TrimSpace(os.Getenv("ACTIVATION_SERVER"))
	if server == "" {
		server = strings.TrimSpace(os.Getenv("OPC_ACTIVATION_SERVER"))
	}
	if server == "" {
		server = DefaultActivationServer
	}
	return &Client{
		ServerURL: server,
		HTTPClient: &http.Client{
			Timeout: 8 * time.Second,
		},
	}
}

// Activate 向远程授权中心提交激活请求
func (c *Client) Activate(ctx context.Context, activationCode, deviceID string, category int) (*RemoteActivationResult, error) {
	normCode := strings.TrimSpace(activationCode)
	if normCode == "" {
		return nil, errors.New("请输入激活码")
	}

	// 本地研发/演示模式默认放行
	if isLocalDevMode(normCode) {
		exp := time.Now().AddDate(1, 0, 0)
		return &RemoteActivationResult{
			OK:             true,
			Code:           "DEV_PASS",
			Message:        "本地开发激活码已就绪",
			Tier:           "developer",
			ExpiresAt:      &exp,
			InitialCredits: 100000000, // 赠送 100 积分
			MaxDevices:     99,
			RawPayload:     map[string]any{"mode": "local_dev"},
		}, nil
	}

	reqPayload := map[string]any{
		"activateCode": normCode,
		"deviceId":     strings.TrimSpace(deviceID),
		"category":     category,
	}

	return c.postRPC(ctx, RemoteActivatePath, reqPayload)
}

// CheckHeartbeat 定时或按需向远程授权中心核验合法性与异常
func (c *Client) CheckHeartbeat(ctx context.Context, activationCode, deviceID string, category int) (*RemoteActivationResult, error) {
	normCode := strings.TrimSpace(activationCode)
	if isLocalDevMode(normCode) {
		return &RemoteActivationResult{
			OK:      true,
			Code:    "DEV_PASS",
			Message: "本地开发激活状态正常",
		}, nil
	}

	reqPayload := map[string]any{
		"activateCode": normCode,
		"deviceId":     strings.TrimSpace(deviceID),
		"category":     category,
	}

	return c.postRPC(ctx, RemoteCheckPath, reqPayload)
}

func (c *Client) postRPC(ctx context.Context, path string, payload map[string]any) (*RemoteActivationResult, error) {
	fullURL, err := url.JoinPath(strings.TrimRight(c.ServerURL, "/"), path)
	if err != nil {
		return nil, fmt.Errorf("解析授权服务器地址失败: %w", err)
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("序列化授权请求失败: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fullURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("构建授权请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "opc-copilot/media-lab-license-client/1.0")

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("远程授权服务连接超时或网络异常，请检查网络后重试: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取授权服务器响应失败: %w", err)
	}

	var rawMap map[string]any
	if err := json.Unmarshal(respBytes, &rawMap); err != nil {
		return nil, fmt.Errorf("授权中心返回非标准响应格式: %s", string(respBytes[:min(len(respBytes), 100)]))
	}

	return parseRPCResponse(rawMap), nil
}

func parseRPCResponse(raw map[string]any) *RemoteActivationResult {
	codeVal := fmt.Sprintf("%v", raw["code"])
	if codeVal == "<nil>" || codeVal == "" {
		codeVal = fmt.Sprintf("%v", raw["status"])
	}
	if codeVal == "<nil>" || codeVal == "" {
		codeVal = fmt.Sprintf("%v", raw["resultCode"])
	}

	msgVal := fmt.Sprintf("%v", raw["message"])
	if msgVal == "<nil>" || msgVal == "" {
		msgVal = fmt.Sprintf("%v", raw["msg"])
	}
	if msgVal == "<nil>" || msgVal == "" {
		msgVal = fmt.Sprintf("%v", raw["resultMsg"])
	}
	if msgVal == "<nil>" {
		msgVal = ""
	}

	isSuccess := raw["success"] == true || successCodes[strings.ToUpper(codeVal)]

	result := &RemoteActivationResult{
		OK:         isSuccess,
		Code:       codeVal,
		Message:    msgVal,
		Tier:       "standard",
		RawPayload: raw,
	}

	if isSuccess && result.Message == "" {
		result.Message = "授权激活成功"
	}
	if !isSuccess && result.Message == "" {
		result.Message = "激活码无效或已被使用"
	}

	// 提取 data 中的附加权益与有效期
	if dataMap, ok := raw["data"].(map[string]any); ok {
		if tierStr, ok := dataMap["tier"].(string); ok && tierStr != "" {
			result.Tier = tierStr
		}
		if maxDev, ok := dataMap["maxDevices"].(float64); ok {
			result.MaxDevices = int(maxDev)
		}
		if credits, ok := dataMap["initialCredits"].(float64); ok {
			result.InitialCredits = int64(credits)
		}
		if expireStr, ok := dataMap["expireAt"].(string); ok && expireStr != "" {
			if t, err := time.Parse(time.RFC3339, expireStr); err == nil {
				result.ExpiresAt = &t
			}
		}
	}

	return result
}

func isLocalDevMode(code string) bool {
	if code == DefaultDevActivationCode {
		return true
	}
	devEnv := strings.ToLower(strings.TrimSpace(os.Getenv("DEV_MODE")))
	if devEnv == "1" || devEnv == "true" {
		if strings.HasPrefix(code, "dev-") || strings.HasPrefix(code, "test-") {
			return true
		}
	}
	return false
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
