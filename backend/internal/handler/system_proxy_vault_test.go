package handler

// @opc-adapter: prompt-vault-macro-injection-test [start]

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
	"infinite-canvas/backend/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func setupTestDBAndService(t *testing.T) (*gorm.DB, *service.Service, *model.User, *model.ModelChannel) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open sqlite in memory: %v", err)
	}
	if err := db.AutoMigrate(
		&model.User{},
		&model.AuthSession{},
		&model.ModelChannel{},
		&model.ChannelModel{},
		&model.ChannelModelPriceTier{},
		&model.IDSequence{},
		&model.SystemSetting{},
		&model.ApiCallLog{},
		&model.CreditAccount{},
		&model.CreditLedgerEntry{},
		&model.BillingOrder{},
	); err != nil {
		t.Fatalf("automigrate failed: %v", err)
	}
	repo := repository.New(db)

	user := &model.User{
		ID:        "test-user-001",
		Email:     "test@zhiying.com",
		Role:      "user",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := db.Create(user).Error; err != nil {
		t.Fatalf("create user failed: %v", err)
	}

	if err := db.Create(&model.CreditAccount{
		UserID:                user.ID,
		AvailableMicrocredits: 100_000_000,
		Version:               1,
		CreatedAt:             time.Now(),
		UpdatedAt:             time.Now(),
	}).Error; err != nil {
		t.Fatalf("create credit account failed: %v", err)
	}

	channel := &model.ModelChannel{
		ID:               "CHANNEL_TEST_001",
		UserID:           user.ID,
		Scope:            model.ChannelScopeSystem,
		Enabled:          true,
		Name:             "测试系统渠道",
		BaseURL:          "http://127.0.0.1:9999",
		APIKey:           "sk-test-key",
		APIFormat:        "openai",
		ModelsJSON:       `["gpt-4o"]`,
		ConcurrencyLimit: 10,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}
	if err := db.Create(channel).Error; err != nil {
		t.Fatalf("create channel failed: %v", err)
	}

	modelRecord := &model.ChannelModel{
		ID:                           "CM_001",
		ChannelID:                    channel.ID,
		ModelKey:                     "gpt-4o",
		ProviderModelKey:             "gpt-4o",
		DisplayName:                  "GPT-4o",
		Capability:                   "text",
		Protocol:                     model.ChannelInterfaceChatCompletion,
		BillingMode:                  "token",
		InputTokenPriceMicrocredits:  1000,
		OutputTokenPriceMicrocredits: 2000,
		PriceConfigured:              true,
		Enabled:                      true,
		CreatedAt:                    time.Now(),
		UpdatedAt:                    time.Now(),
	}
	if err := db.Create(modelRecord).Error; err != nil {
		t.Fatalf("create channel model failed: %v", err)
	}

	tier := &model.ChannelModelPriceTier{
		ID:                           "TIER_001",
		ChannelModelID:               modelRecord.ID,
		SelectorKey:                  "{}",
		SelectorJSON:                 "{}",
		BillingMode:                  "token",
		InputTokenPriceMicrocredits:  1000,
		OutputTokenPriceMicrocredits: 2000,
		PriceConfigured:              true,
		Enabled:                      true,
		CreatedAt:                    time.Now(),
		UpdatedAt:                    time.Now(),
	}
	if err := db.Create(tier).Error; err != nil {
		t.Fatalf("create tier failed: %v", err)
	}

	svc := service.New(repo, t.TempDir())
	ConfigureRuntime(svc)
	return db, svc, user, channel
}

func TestSystemProxyExpandsVaultPromptMacro(t *testing.T) {
	t.Setenv("CANVAS_ALLOW_PRIVATE_UPSTREAMS", "true")
	gin.SetMode(gin.TestMode)
	db, svc, user, channel := setupTestDBAndService(t)

	var upstreamReceivedBody []byte
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamReceivedBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"chatcmpl-123","choices":[{"message":{"role":"assistant","content":"分镜脚本完成"}}]}`))
	}))
	defer upstream.Close()

	// Update channel BaseURL to point to upstream mock server
	channel.BaseURL = upstream.URL
	_ = db.Save(channel)

	router := gin.New()
	router.POST("/api/ai/system/:channelId/*path", func(c *gin.Context) {
		proxySystemRequestPath(c, svc, user, channel, c.Param("path"))
	})

	// Client sends a request containing the vault macro in the system message
	reqBody := `{"model":"gpt-4o","messages":[{"role":"system","content":"__VAULT_PROMPT__:creation-assistant"},{"role":"user","content":"创作脚本文案"}]}`
	req := httptest.NewRequest(http.MethodPost, "/api/ai/system/"+channel.ID+"/chat/completions", strings.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("system proxy failed with status %d: %s", rec.Code, rec.Body.String())
	}

	if len(upstreamReceivedBody) == 0 {
		t.Fatalf("upstream server received empty body")
	}

	var parsedUpstream map[string]interface{}
	if err := json.Unmarshal(upstreamReceivedBody, &parsedUpstream); err != nil {
		t.Fatalf("parse upstream JSON failed: %v", err)
	}

	msgs := parsedUpstream["messages"].([]interface{})
	sysMsg := msgs[0].(map[string]interface{})
	sysContent := sysMsg["content"].(string)

	if strings.Contains(sysContent, "__VAULT_PROMPT__:") {
		t.Errorf("upstream received unexpanded __VAULT_PROMPT__: macro!")
	}
	if !strings.Contains(sysContent, "顶级短视频编导") {
		t.Errorf("upstream did not receive the expanded creation-assistant system prompt! len=%d", len(sysContent))
	}
	if !strings.Contains(sysContent, "[SYSTEM SECURITY DIRECTIVE - ABSOLUTE PRIORITY]") {
		t.Errorf("upstream prompt did not contain AntiExtractionDirective!")
	}
}

func TestSystemProxyInjectsVaultPromptHeader(t *testing.T) {
	t.Setenv("CANVAS_ALLOW_PRIVATE_UPSTREAMS", "true")
	gin.SetMode(gin.TestMode)
	db, svc, user, channel := setupTestDBAndService(t)

	var upstreamReceivedBody []byte
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamReceivedBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"chatcmpl-456","choices":[{"message":{"role":"assistant","content":"脚本解析成功"}}]}`))
	}))
	defer upstream.Close()

	channel.BaseURL = upstream.URL
	_ = db.Save(channel)

	router := gin.New()
	router.POST("/api/ai/system/:channelId/*path", func(c *gin.Context) {
		proxySystemRequestPath(c, svc, user, channel, c.Param("path"))
	})

	// Client sends only user message, but specifies X-Canvas-System-Prompt-ID header
	reqBody := `{"model":"gpt-4o","messages":[{"role":"user","content":"生成分镜脚本"}]}`
	req := httptest.NewRequest(http.MethodPost, "/api/ai/system/"+channel.ID+"/chat/completions", strings.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Canvas-System-Prompt-ID", "creation-assistant")

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("system proxy failed with status %d: %s", rec.Code, rec.Body.String())
	}

	var parsedUpstream map[string]interface{}
	if err := json.Unmarshal(upstreamReceivedBody, &parsedUpstream); err != nil {
		t.Fatalf("parse upstream JSON failed: %v", err)
	}

	msgs := parsedUpstream["messages"].([]interface{})
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages (system prepended + user), got %d", len(msgs))
	}
	sysMsg := msgs[0].(map[string]interface{})
	if sysMsg["role"] != "system" {
		t.Errorf("expected prepended message to be system, got %v", sysMsg["role"])
	}
	sysContent := sysMsg["content"].(string)
	if !strings.Contains(sysContent, "顶级短视频编导") {
		t.Errorf("expected header-injected prompt to contain '顶级短视频编导', got len=%d", len(sysContent))
	}
}

// @opc-adapter: prompt-vault-macro-injection-test [end]
