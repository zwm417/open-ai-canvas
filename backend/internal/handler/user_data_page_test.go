package handler

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
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

func TestCanvasProjectResponseETagChangesWithRevisionMetadata(t *testing.T) {
	project := &model.CanvasProject{Revision: 7, UpdatedAt: time.Date(2026, 9, 28, 12, 0, 0, 123000000, time.UTC)}
	first := canvasProjectResponseETag(project)
	if first != `W/"canvas-7"` {
		t.Fatalf("unexpected canvas ETag: %s", first)
	}
	if !ifNoneMatch(`"canvas-7"`, first) || !ifNoneMatch(first, first) {
		t.Fatal("strong and weak validators should match for conditional GET")
	}
	project.Revision++
	if first == canvasProjectResponseETag(project) {
		t.Fatal("revision change must invalidate the canvas ETag")
	}
}

func TestAcceptsGzipHonorsQualityAndWildcard(t *testing.T) {
	for _, test := range []struct {
		header string
		want   bool
	}{
		{header: "gzip, br", want: true},
		{header: "gzip;q=0, *;q=1", want: false},
		{header: "br, *;q=0.5", want: true},
		{header: "br, gzip;q=0.2", want: true},
		{header: "br, gzip;q=0", want: false},
	} {
		if got := acceptsGzip(test.header); got != test.want {
			t.Errorf("acceptsGzip(%q) = %v, want %v", test.header, got, test.want)
		}
	}
}

func TestOkCanvasProjectCompressesLargeResponses(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest("GET", "/api/canvas-projects/canvas", nil)
	ctx.Request.Header.Set("Accept-Encoding", "gzip")
	project := json.RawMessage(`{"nodes":["` + strings.Repeat("x", 2048) + `"]}`)

	okCanvasProject(ctx, project)

	if got := recorder.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("Content-Encoding = %q, want gzip", got)
	}
	reader, err := gzip.NewReader(bytes.NewReader(recorder.Body.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	if err := reader.Close(); err != nil {
		t.Fatal(err)
	}
	if !json.Valid(body) {
		t.Fatalf("decompressed response is not valid JSON: %s", body)
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

