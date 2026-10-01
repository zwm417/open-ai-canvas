package handler

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/service"

	"github.com/gin-gonic/gin"
)

func TestUserDataIncrementalRoutesAreRegistered(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	RegisterUserDataRoutes(router.Group("/api"), &service.Service{})
	wanted := map[string]bool{
		"GET /api/canvas-projects":      false,
		"GET /api/canvas-projects/:id":  false,
		"POST /api/assets/batch":        false,
		"POST /api/assets/batch-delete": false,
	}
	for _, route := range router.Routes() {
		key := route.Method + " " + route.Path
		if _, exists := wanted[key]; exists {
			wanted[key] = true
		}
	}
	for route, found := range wanted {
		if !found {
			t.Errorf("missing route: %s", route)
		}
	}
}

// @opc-adapter: prompt-vault-endpoints-test [start]

func TestPromptVaultEndpoints(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	RegisterUserDataRoutes(router.Group("/api"), &service.Service{})

	// 1. 验证已有反推接口
	w1 := httptest.NewRecorder()
	req1 := httptest.NewRequest("GET", "/api/prompts/creative-reverse-deconstruct", nil)
	router.ServeHTTP(w1, req1)
	if w1.Code != 200 {
		t.Fatalf("creative-reverse-deconstruct status = %d", w1.Code)
	}

	// 2. 验证通用 /prompts/:id 接口
	w2 := httptest.NewRecorder()
	req2 := httptest.NewRequest("GET", "/api/prompts/creation-assistant", nil)
	router.ServeHTTP(w2, req2)
	if w2.Code != 200 {
		t.Fatalf("creation-assistant status = %d", w2.Code)
	}
	var res2 map[string]interface{}
	if err := json.Unmarshal(w2.Body.Bytes(), &res2); err != nil {
		t.Fatalf("json parse error: %v", err)
	}
	data2, _ := res2["data"].(map[string]interface{})
	promptStr, _ := data2["prompt"].(string)
	if len(promptStr) < 1000 || !strings.Contains(promptStr, "顶级短视频编导") {
		t.Fatalf("prompt content invalid, len=%d, body=%s", len(promptStr), w2.Body.String())
	}

	// 3. 验证未知 ID 返回 404
	w3 := httptest.NewRecorder()
	req3 := httptest.NewRequest("GET", "/api/prompts/non-existent-prompt-id", nil)
	router.ServeHTTP(w3, req3)
	if w3.Code != 404 {
		t.Fatalf("expected 404 for unknown prompt, got %d", w3.Code)
	}
}

// @opc-adapter: prompt-vault-endpoints-test [end]

