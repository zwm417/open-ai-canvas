package handler

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/service"

	"github.com/gin-gonic/gin"
)

func TestCustomRelayForwardsOpenAIRequestWithoutBrowserHeaders(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const apiKey = "relay-secret-key"
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+apiKey {
			t.Errorf("Authorization = %q", r.Header.Get("Authorization"))
		}
		if r.Header.Get("User-Agent") != "Custom Relay Agent" {
			t.Errorf("User-Agent = %q", r.Header.Get("User-Agent"))
		}
		if r.Header.Get("X-Gateway-Tenant") != "tenant-a" {
			t.Errorf("X-Gateway-Tenant = %q", r.Header.Get("X-Gateway-Tenant"))
		}
		for _, name := range []string{"Cookie", "Origin", "Referer", "X-Canvas-Upstream-URL", "X-Forwarded-For"} {
			if value := r.Header.Get(name); value != "" {
				t.Errorf("upstream received %s = %q", name, value)
			}
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Set-Cookie", "upstream=unsafe")
		_, _ = io.WriteString(w, `{"data":[]}`)
	}))
	defer upstream.Close()
	useCustomRelayTestClient(t, upstream.Client())
	t.Setenv("CANVAS_ALLOW_PRIVATE_UPSTREAMS", "true")
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")

	request := httptest.NewRequest(http.MethodGet, "/api/ai/custom", nil)
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("X-Canvas-Upstream-URL", upstream.URL+"/v1/models")
	request.Header.Set("X-Canvas-Upstream-Format", "openai")
	prepareRelayTestRequest(t, request)
	request.Header.Set(service.CustomRelayHeadersHeader, base64.StdEncoding.EncodeToString([]byte(`[{"name":"User-Agent","value":"Custom Relay Agent"},{"name":"X-Gateway-Tenant","value":"tenant-a"}]`)))
	request.Header.Set("Cookie", "browser=session")
	request.Header.Set("Origin", "https://canvas.example.com")
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = request

	proxyCustomRelayRequest(context, defaultCustomRelayTestPolicy())
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if response.Header().Get("Set-Cookie") != "" {
		t.Fatal("upstream Set-Cookie should not be forwarded")
	}
	if strings.Contains(response.Body.String(), apiKey) {
		t.Fatal("response leaked API key")
	}
}

func TestCustomRelayReturnsVideoContent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "video/mp4")
		_, _ = w.Write([]byte("video-content"))
	}))
	defer upstream.Close()
	useCustomRelayTestClient(t, upstream.Client())
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")

	request := httptest.NewRequest(http.MethodGet, "/api/ai/custom", nil)
	request.Header.Set("Authorization", "Bearer test-key")
	request.Header.Set("X-Canvas-Upstream-URL", upstream.URL+"/v1/videos/task-1/content")
	request.Header.Set("X-Canvas-Upstream-Format", "openai")
	prepareRelayTestRequest(t, request)
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = request

	proxyCustomRelayRequest(context, defaultCustomRelayTestPolicy())
	if response.Code != http.StatusOK || response.Header().Get("Content-Type") != "video/mp4" || response.Body.String() != "video-content" {
		t.Fatalf("status = %d, content-type = %q, body = %q", response.Code, response.Header().Get("Content-Type"), response.Body.String())
	}
}

func TestCustomRelayConvertsGeminiAuthentication(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const apiKey = "gemini-secret-key"
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-goog-api-key") != apiKey {
			t.Errorf("x-goog-api-key = %q", r.Header.Get("x-goog-api-key"))
		}
		if r.Header.Get("Authorization") != "" {
			t.Errorf("Authorization should not be forwarded, got %q", r.Header.Get("Authorization"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"candidates":[]}`)
	}))
	defer upstream.Close()
	useCustomRelayTestClient(t, upstream.Client())
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")

	request := httptest.NewRequest(http.MethodPost, "/api/ai/custom", strings.NewReader(`{"contents":[]}`))
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Canvas-Upstream-URL", upstream.URL+"/v1beta/models/gemini-test:generateContent")
	request.Header.Set("X-Canvas-Upstream-Format", "gemini")
	prepareRelayTestRequest(t, request)
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = request

	proxyCustomRelayRequest(context, defaultCustomRelayTestPolicy())
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestCustomRelayConvertsClaudeAuthentication(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const apiKey = "claude-secret-key"
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/messages" {
			t.Errorf("path = %q", r.URL.Path)
		}
		if r.Header.Get("x-api-key") != apiKey {
			t.Errorf("x-api-key = %q", r.Header.Get("x-api-key"))
		}
		if r.Header.Get("Authorization") != "" {
			t.Errorf("Authorization should not be forwarded, got %q", r.Header.Get("Authorization"))
		}
		if r.Header.Get("anthropic-version") != "2023-06-01" {
			t.Errorf("anthropic-version = %q", r.Header.Get("anthropic-version"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"content":[{"type":"text","text":"claude relay works"}]}`)
	}))
	defer upstream.Close()
	useCustomRelayTestClient(t, upstream.Client())
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")

	request := httptest.NewRequest(http.MethodPost, "/api/ai/custom", strings.NewReader(`{"model":"claude-test","messages":[]}`))
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Canvas-Upstream-URL", upstream.URL+"/v1/messages")
	request.Header.Set("X-Canvas-Upstream-Format", "claude")
	prepareRelayTestRequest(t, request)
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = request

	proxyCustomRelayRequest(context, defaultCustomRelayTestPolicy())
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "claude relay works") {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func TestCustomRelayStreamsBeforeUpstreamCompletes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const apiKey = "stream-secret"
	release := make(chan struct{})
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: first\n\n")
		w.(http.Flusher).Flush()
		<-release
		_, _ = io.WriteString(w, "data: second\n\n")
	}))
	defer upstream.Close()
	useCustomRelayTestClient(t, upstream.Client())
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")

	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		context, _ := gin.CreateTestContext(w)
		context.Request = r
		proxyCustomRelayRequest(context, defaultCustomRelayTestPolicy())
	}))
	defer proxy.Close()
	request, _ := http.NewRequest(http.MethodPost, proxy.URL, strings.NewReader(`{"model":"test"}`))
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "text/event-stream")
	request.Header.Set("X-Canvas-Upstream-URL", upstream.URL+"/v1/responses")
	request.Header.Set("X-Canvas-Upstream-Format", "openai")
	prepareRelayTestRequest(t, request)
	client := &http.Client{Timeout: 3 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		close(release)
		t.Fatal(err)
	}
	reader := bufio.NewReader(response.Body)
	line, err := reader.ReadString('\n')
	if err != nil {
		close(release)
		_ = response.Body.Close()
		t.Fatal(err)
	}
	if line != "data: first\n" {
		close(release)
		_ = response.Body.Close()
		t.Fatalf("first streamed line = %q", line)
	}
	close(release)
	_ = response.Body.Close()
}

func TestRelayStreamRedactorHandlesSplitSecret(t *testing.T) {
	redactor := newRelayStreamRedactor("split-secret")
	output := append(redactor.Push([]byte("before split-"), false), redactor.Push([]byte("secret after"), true)...)
	if bytes.Contains(output, []byte("split-secret")) || !bytes.Contains(output, []byte("[REDACTED]")) {
		t.Fatalf("redacted output = %q", output)
	}
}

func TestCustomRelayRejectsOversizedDeclaredBodyBeforeConnecting(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	connected := false
	previous := customRelayClient
	customRelayClient = func(time.Duration) *http.Client {
		connected = true
		return http.DefaultClient
	}
	t.Cleanup(func() { customRelayClient = previous })

	request := httptest.NewRequest(http.MethodPost, "/api/ai/custom", strings.NewReader(`{"model":"test"}`))
	request.ContentLength = (defaultCustomRelayTestPolicy().CustomRelayRequestMB << 20) + 1
	request.Header.Set("Authorization", "Bearer test-key")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Canvas-Upstream-URL", "https://127.0.0.1/v1/responses")
	request.Header.Set("X-Canvas-Upstream-Format", "openai")
	prepareRelayTestRequest(t, request)
	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = request

	proxyCustomRelayRequest(context, defaultCustomRelayTestPolicy())
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if connected {
		t.Fatal("oversized request should not create an upstream client")
	}
}

func useCustomRelayTestClient(t *testing.T, client *http.Client) {
	t.Helper()
	previous := customRelayClient
	customRelayClient = func(time.Duration) *http.Client { return client }
	t.Cleanup(func() { customRelayClient = previous })
}

func prepareRelayTestRequest(t *testing.T, request *http.Request) {
	t.Helper()
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	_ = request
}

func defaultCustomRelayTestPolicy() service.RuntimeRequestPolicy {
	return service.RuntimeRequestPolicy{
		CustomRelayRequestMB: 32, CustomRelayResponseMB: 32, CustomRelayTimeoutMinutes: 10,
	}
}

// @opc-adapter: prompt-vault-macro-injection-test [start]

func TestVaultPromptInjectionUnit(t *testing.T) {
	// 1. OpenAI 格式 + Header 指定提示词资产
	rawOpenAI := []byte(`{"model":"gpt-4o","messages":[{"role":"user","content":"你好"}]}`)
	injectedOpenAI, err := injectVaultPromptToRelayBody("creation-assistant", "openai", rawOpenAI)
	if err != nil {
		t.Fatalf("injectVaultPromptToRelayBody error: %v", err)
	}

	var parsedOpenAI map[string]interface{}
	if err := json.Unmarshal(injectedOpenAI, &parsedOpenAI); err != nil {
		t.Fatalf("json parse error: %v", err)
	}
	msgs, ok := parsedOpenAI["messages"].([]interface{})
	if !ok || len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	sysMsg := msgs[0].(map[string]interface{})
	if sysMsg["role"] != "system" {
		t.Errorf("expected role system, got %v", sysMsg["role"])
	}
	sysContent := sysMsg["content"].(string)
	if !strings.Contains(sysContent, "顶级短视频编导") {
		t.Errorf("expected system prompt to contain '顶级短视频编导', got %d chars", len(sysContent))
	}

	// 2. Claude 格式 + Header 指定提示词资产
	rawClaude := []byte(`{"model":"claude-3-7-sonnet","messages":[{"role":"user","content":"你好"}]}`)
	injectedClaude, err := injectVaultPromptToRelayBody("creative-reverse", "claude", rawClaude)
	if err != nil {
		t.Fatalf("injectClaude error: %v", err)
	}
	var parsedClaude map[string]interface{}
	if err := json.Unmarshal(injectedClaude, &parsedClaude); err != nil {
		t.Fatalf("json parse error: %v", err)
	}
	claudeSys, _ := parsedClaude["system"].(string)
	if !strings.Contains(claudeSys, "逐镜头全息视听工程图纸拆解") {
		t.Errorf("expected claude system to contain '逐镜头全息视听工程图纸拆解'")
	}

	// 3. 宏占位符替换 __VAULT_PROMPT__:<id>
	rawWithMacro := []byte(`{"messages":[{"role":"system","content":"__VAULT_PROMPT__:video-workbench\n\n【用户特别要求】\n主角穿红衣服"}]}`)
	injectedMacro, err := injectVaultPromptToRelayBody("", "openai", rawWithMacro)
	if err != nil {
		t.Fatalf("injectMacro error: %v", err)
	}
	var parsedMacro map[string]interface{}
	if err := json.Unmarshal(injectedMacro, &parsedMacro); err != nil {
		t.Fatalf("json parse error: %v", err)
	}
	macroMsgs := parsedMacro["messages"].([]interface{})
	macroSysContent := macroMsgs[0].(map[string]interface{})["content"].(string)
	if strings.Contains(macroSysContent, "__VAULT_PROMPT__:") {
		t.Errorf("macro was not replaced!")
	}
	if !strings.Contains(macroSysContent, "商业标的洞察") {
		t.Errorf("expected macro to be replaced with video-workbench prompt")
	}
	if !strings.Contains(macroSysContent, "主角穿红衣服") {
		t.Errorf("expected user notes to be preserved")
	}

	// 4. 多模态结构 Parts 数组包含宏占位符
	rawParts := []byte(`{"messages":[{"role":"system","content":[{"type":"text","text":"__VAULT_PROMPT__:creation-assistant"}]}]}`)
	injectedParts, err := injectVaultPromptToRelayBody("", "openai", rawParts)
	if err != nil {
		t.Fatalf("injectParts error: %v", err)
	}
	var parsedParts map[string]interface{}
	if err := json.Unmarshal(injectedParts, &parsedParts); err != nil {
		t.Fatalf("json parse error: %v", err)
	}
	partsList := parsedParts["messages"].([]interface{})[0].(map[string]interface{})["content"].([]interface{})
	partText := partsList[0].(map[string]interface{})["text"].(string)
	if !strings.Contains(partText, "顶级短视频编导") {
		t.Errorf("expected multi-modal parts text to expand macro")
	}

	// 5. Responses API input 数组包含宏占位符
	rawResponses := []byte(`{"input":[{"role":"system","content":"__VAULT_PROMPT__:video-workbench"}]}`)
	injectedResponses, err := injectVaultPromptToRelayBody("", "openai", rawResponses)
	if err != nil {
		t.Fatalf("injectResponses error: %v", err)
	}
	var parsedResponses map[string]interface{}
	if err := json.Unmarshal(injectedResponses, &parsedResponses); err != nil {
		t.Fatalf("json parse error: %v", err)
	}
	respMsgs := parsedResponses["input"].([]interface{})
	respContent := respMsgs[0].(map[string]interface{})["content"].(string)
	if !strings.Contains(respContent, "商业标的洞察") {
		t.Errorf("expected responses input to expand macro")
	}

	// 6. Completions API prompt 包含宏占位符
	rawPrompt := []byte(`{"prompt":"__VAULT_PROMPT__:creative-reverse"}`)
	injectedPrompt, err := injectVaultPromptToRelayBody("", "openai", rawPrompt)
	if err != nil {
		t.Fatalf("injectPrompt error: %v", err)
	}
	var parsedPrompt map[string]interface{}
	if err := json.Unmarshal(injectedPrompt, &parsedPrompt); err != nil {
		t.Fatalf("json parse error: %v", err)
	}
	if !strings.Contains(parsedPrompt["prompt"].(string), "逐镜头全息视听工程图纸拆解") {
		t.Errorf("expected completions prompt to expand macro")
	}

	// 7. 顶层 system 字段包含宏占位符
	rawTopSys := []byte(`{"system":"__VAULT_PROMPT__:video-reverse-classic"}`)
	injectedTopSys, err := injectVaultPromptToRelayBody("", "openai", rawTopSys)
	if err != nil {
		t.Fatalf("injectTopSys error: %v", err)
	}
	var parsedTopSys map[string]interface{}
	if err := json.Unmarshal(injectedTopSys, &parsedTopSys); err != nil {
		t.Fatalf("json parse error: %v", err)
	}
	if !strings.Contains(parsedTopSys["system"].(string), "工业级”像素拆解") {
		t.Errorf("expected top-level system to expand macro")
	}
}

func TestCustomRelayInjectsVaultPromptHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)
	const apiKey = "relay-secret-key"
	var receivedBody map[string]interface{}

	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Canvas-System-Prompt-ID") != "" {
			t.Errorf("internal header X-Canvas-System-Prompt-ID leaked to upstream!")
		}
		data, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(data, &receivedBody)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"choices":[{"message":{"content":"ok"}}]}`)
	}))
	defer upstream.Close()

	useCustomRelayTestClient(t, upstream.Client())
	t.Setenv("CANVAS_ALLOW_PRIVATE_UPSTREAMS", "true")
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")

	requestBody := `{"model":"gpt-4o","messages":[{"role":"user","content":"写分镜"}]}`
	request := httptest.NewRequest(http.MethodPost, "/api/ai/custom", strings.NewReader(requestBody))
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Canvas-Upstream-URL", upstream.URL+"/v1/chat/completions")
	request.Header.Set("X-Canvas-Upstream-Format", "openai")
	request.Header.Set("X-Canvas-System-Prompt-ID", "creation-assistant")
	prepareRelayTestRequest(t, request)

	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = request

	proxyCustomRelayRequest(context, defaultCustomRelayTestPolicy())
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}

	msgs, ok := receivedBody["messages"].([]interface{})
	if !ok || len(msgs) < 2 {
		t.Fatalf("upstream should have received prepended system prompt, got: %+v", receivedBody)
	}
	sysMsg := msgs[0].(map[string]interface{})
	if sysMsg["role"] != "system" {
		t.Errorf("expected first message to be system, got %v", sysMsg["role"])
	}
	content := sysMsg["content"].(string)
	if !strings.Contains(content, "顶级短视频编导") {
		t.Errorf("expected system content to contain '顶级短视频编导', got %d chars", len(content))
	}
}

// @opc-adapter: prompt-vault-macro-injection-test [end]
