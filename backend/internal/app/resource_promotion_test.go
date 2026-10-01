// @opc-adapter: auto-promote-local-resource-to-oss [start]
package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/assets"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/storage"
)

func TestEnsureResourceOnActiveOSS(t *testing.T) {
	t.Setenv("CANVAS_ALLOW_PRIVATE_UPSTREAMS", "true")
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1,localhost")
	svc := newResourceTestService(t)

	// Mock S3 server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			w.Header().Set("ETag", `"mock-etag"`)
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Configure system OSS
	systemSetting := ossSettingValue{
		Enabled:         true,
		Provider:        "s3",
		Region:          "us-east-1",
		Endpoint:        server.URL,
		Bucket:          "zhiying",
		AccessKeyID:     "mock-key",
		AccessKeySecret: "mock-secret",
		PathPrefix:      "open-ai-canvas",
	}
	systemJSON, _ := json.Marshal(systemSetting)
	if err := svc.repo.SaveSystemSetting(&model.SystemSetting{Key: "oss", ValueJSON: string(systemJSON)}); err != nil {
		t.Fatal(err)
	}

	// Prepare local resource file
	localRelKey := filepath.Join("users", "user-1", "image", "2026", "09", "20", "test.png")
	localAbsPath := filepath.Join(svc.dataDir, "resources", localRelKey)
	if err := os.MkdirAll(filepath.Dir(localAbsPath), 0o750); err != nil {
		t.Fatal(err)
	}
	testPayload := []byte("fake-png-content")
	if err := os.WriteFile(localAbsPath, testPayload, 0o640); err != nil {
		t.Fatal(err)
	}

	res := &model.Resource{
		ID:        "res-local-1",
		UserID:    "user-1",
		Kind:      "image",
		Status:    model.ResourceStatusReady,
		Provider:  "local",
		ObjectKey: filepath.ToSlash(localRelKey),
		MimeType:  "image/png",
		Size:      int64(len(testPayload)),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := svc.repo.CreateResource(res); err != nil {
		t.Fatal(err)
	}

	// Test ensureResourceOnActiveOSS
	promoted, err := svc.ensureResourceOnActiveOSS(res)
	if err != nil {
		t.Fatalf("ensureResourceOnActiveOSS failed: %v", err)
	}
	if !promoted {
		t.Fatal("expected promoted to be true")
	}

	if res.Provider != "s3" {
		t.Fatalf("expected provider s3, got %s", res.Provider)
	}
	if res.Bucket != "zhiying" {
		t.Fatalf("expected bucket zhiying, got %s", res.Bucket)
	}
	if !strings.HasPrefix(res.ObjectKey, "open-ai-canvas/users/user-1/image/") {
		t.Fatalf("unexpected object key: %s", res.ObjectKey)
	}

	// Verify database record updated
	dbRes, err := svc.repo.Resource("res-local-1")
	if err != nil {
		t.Fatal(err)
	}
	if dbRes.Provider != "s3" {
		t.Fatalf("expected db provider s3, got %s", dbRes.Provider)
	}
}

func TestResolveResourceAccessAutoPromotesForProvider(t *testing.T) {
	t.Setenv("CANVAS_ALLOW_PRIVATE_UPSTREAMS", "true")
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1,localhost")
	svc := newResourceTestService(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("ETag", `"mock-etag"`)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	systemSetting := ossSettingValue{
		Enabled:         true,
		Provider:        "s3",
		Region:          "us-east-1",
		Endpoint:        server.URL,
		CDNBaseURL:      "https://zhiying.cn-nb2.rains3.com",
		Delivery: storage.DeliverySettings{
			CDNAuthMode: "public",
		},
		Bucket:          "zhiying",
		AccessKeyID:     "mock-key",
		AccessKeySecret: "mock-secret",
		PathPrefix:      "open-ai-canvas",
	}
	systemJSON, _ := json.Marshal(systemSetting)
	if err := svc.repo.SaveSystemSetting(&model.SystemSetting{Key: "oss", ValueJSON: string(systemJSON)}); err != nil {
		t.Fatal(err)
	}

	localRelKey := filepath.Join("users", "user-1", "image", "2026", "09", "20", "test2.png")
	localAbsPath := filepath.Join(svc.dataDir, "resources", localRelKey)
	if err := os.MkdirAll(filepath.Dir(localAbsPath), 0o750); err != nil {
		t.Fatal(err)
	}
	testPayload := []byte("fake-png-content-2")
	if err := os.WriteFile(localAbsPath, testPayload, 0o640); err != nil {
		t.Fatal(err)
	}

	res := &model.Resource{
		ID:        "res-local-2",
		UserID:    "user-1",
		Kind:      "image",
		Status:    model.ResourceStatusReady,
		Provider:  "local",
		ObjectKey: filepath.ToSlash(localRelKey),
		MimeType:  "image/png",
		Size:      int64(len(testPayload)),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := svc.repo.CreateResource(res); err != nil {
		t.Fatal(err)
	}

	// Resolve access for PurposeProvider
	access, err := svc.resolveResourceAccess(res, ResourceAccessOptions{
		Purpose: assets.PurposeProvider,
	})
	if err != nil {
		t.Fatalf("resolveResourceAccess failed: %v", err)
	}

	if access == nil || access.URL == "" {
		t.Fatal("expected non-empty access URL")
	}
	if !strings.Contains(access.URL, "zhiying") {
		t.Fatalf("expected access URL to contain bucket zhiying, got %s", access.URL)
	}
}

func TestBackfillLocalResourceOSSPromotion(t *testing.T) {
	t.Setenv("CANVAS_ALLOW_PRIVATE_UPSTREAMS", "true")
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1,localhost")
	svc := newResourceTestService(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("ETag", `"mock-etag"`)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	systemSetting := ossSettingValue{
		Enabled:         true,
		Provider:        "s3",
		Region:          "us-east-1",
		Endpoint:        server.URL,
		Bucket:          "zhiying",
		AccessKeyID:     "mock-key",
		AccessKeySecret: "mock-secret",
		PathPrefix:      "open-ai-canvas",
	}
	systemJSON, _ := json.Marshal(systemSetting)
	if err := svc.repo.SaveSystemSetting(&model.SystemSetting{Key: "oss", ValueJSON: string(systemJSON)}); err != nil {
		t.Fatal(err)
	}

	for i := 1; i <= 3; i++ {
		key := filepath.Join("users", "user-1", "image", "2026", "09", "20", fmt.Sprintf("batch-%d.png", i))
		abs := filepath.Join(svc.dataDir, "resources", key)
		_ = os.MkdirAll(filepath.Dir(abs), 0o750)
		_ = os.WriteFile(abs, []byte("data"), 0o640)
		res := &model.Resource{
			ID:        fmt.Sprintf("batch-res-%d", i),
			UserID:    "user-1",
			Kind:      "image",
			Status:    model.ResourceStatusReady,
			Provider:  "local",
			ObjectKey: filepath.ToSlash(key),
			MimeType:  "image/png",
			Size:      4,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		_ = svc.repo.CreateResource(res)
	}

	svc.BackfillLocalResourceOSSPromotion()

	remaining, err := svc.repo.ReadyLocalResources(10)
	if err != nil {
		t.Fatal(err)
	}
	if len(remaining) != 0 {
		t.Fatalf("expected 0 remaining local resources, got %d", len(remaining))
	}
}
// @opc-adapter: auto-promote-local-resource-to-oss [end]
