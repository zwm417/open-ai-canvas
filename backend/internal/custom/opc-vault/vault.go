package opcvault

// @opc-adapter: opc-prompt-vault [start]

import (
	"bytes"
	"embed"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

//go:embed assets/*.md
var embeddedAssets embed.FS

// PromptMetadata 存储提示词元信息与热更缓存
type PromptMetadata struct {
	ID           string
	Filename     string
	Title        string
	Description  string
	Content      string
	LastModified time.Time
}

var (
	// promptMapping 规范化 ID 到物理资产文件名映射
	promptMapping = map[string]string{
		"creative-reverse":               "creative-reverse.md",
		"creative-reverse-deconstruct":   "creative-reverse.md",
		"creative-replication":           "creative-replication.md",
		"creative-replication-director":  "creative-replication.md",
		"creation-assistant":             "creation-assistant.md",
		"creation-assistant-reference":   "creation-assistant-reference.md",
		"video-workbench":                "video-workbench.md",
		"video-reverse-classic":          "video-reverse-classic.md",
		"video-reverse":                  "video-reverse-classic.md",
		"seedance-replication":           "seedance-replication.md",
	}

	mu    sync.RWMutex
	cache = make(map[string]*PromptMetadata)

	// 自定义资产目录（可由环境变量覆盖）
	customVaultDir string
)

func init() {
	if dir := os.Getenv("OPC_VAULT_DIR"); dir != "" {
		customVaultDir = dir
	}
}

// SetVaultDir 允许测试或引导器覆盖物理资产目录
func SetVaultDir(dir string) {
	mu.Lock()
	defer mu.Unlock()
	customVaultDir = dir
	// 清空缓存以重新加载
	cache = make(map[string]*PromptMetadata)
}

// resolveDiskPath 尝试在本地磁盘探测物理资产路径（用于开发态内存热重载）
func resolveDiskPath(filename string) string {
	candidateRoots := []string{}
	if customVaultDir != "" {
		candidateRoots = append(candidateRoots, customVaultDir)
	}

	// 环境变量未显式指定时，按多种可能的工作目录进行自适应探测
	cwd, err := os.Getwd()
	if err == nil {
		candidateRoots = append(candidateRoots,
			filepath.Join(cwd, "internal/custom/opc-vault/assets"),
			filepath.Join(cwd, "backend/internal/custom/opc-vault/assets"),
			filepath.Join(cwd, "media-lab/backend/internal/custom/opc-vault/assets"),
			filepath.Join(cwd, "assets"),
		)
	}

	// 执行程序同级目录探测
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidateRoots = append(candidateRoots,
			filepath.Join(exeDir, "internal/custom/opc-vault/assets"),
			filepath.Join(exeDir, "assets"),
		)
	}

	for _, root := range candidateRoots {
		target := filepath.Join(root, filename)
		if fi, err := os.Stat(target); err == nil && !fi.IsDir() {
			return target
		}
	}

	return ""
}

// sanitizeUTF8Content 严格校验 UTF-8 并防御性剥除任何意外残留的 UTF-8 BOM
func sanitizeUTF8Content(raw []byte) (string, error) {
	// 剔除可能存在的 UTF-8 BOM (\xEF\xBB\xBF)
	trimmed := bytes.TrimPrefix(raw, []byte{0xEF, 0xBB, 0xBF})
	if !utf8.Valid(trimmed) {
		return "", errors.New("提示词资产包含非标准 UTF-8 编码字符")
	}
	return strings.TrimSpace(string(trimmed)), nil
}

// GetPrompt 获取指定 ID 的提示词文本。
// 开发态自动探测磁盘更新实现零编译秒级热更；生产态回退至嵌入式只读内存（//go:embed）。
func GetPrompt(promptID string) (string, error) {
	normID := strings.TrimSpace(strings.ToLower(promptID))
	filename, exists := promptMapping[normID]
	if !exists {
		return "", fmt.Errorf("未知的提示词资产标识: %s", promptID)
	}

	diskPath := resolveDiskPath(filename)

	// 1. 本地磁盘存在时，走热重载逻辑
	if diskPath != "" {
		fi, err := os.Stat(diskPath)
		if err == nil {
			mu.RLock()
			cached, ok := cache[filename]
			if ok && cached != nil && cached.LastModified.Equal(fi.ModTime()) {
				defer mu.RUnlock()
				return cached.Content, nil
			}
			mu.RUnlock()

			// 需要更新缓存
			data, readErr := os.ReadFile(diskPath)
			if readErr == nil {
				sanitized, sanitizeErr := sanitizeUTF8Content(data)
				if sanitizeErr == nil {
					mu.Lock()
					cache[filename] = &PromptMetadata{
						ID:           normID,
						Filename:     filename,
						Content:      sanitized,
						LastModified: fi.ModTime(),
					}
					mu.Unlock()
					return sanitized, nil
				}
			}
		}
	}

	// 2. 磁盘未探测到或读取异常时，回退至编译期嵌入的只读资产
	mu.RLock()
	cached, ok := cache[filename]
	if ok && cached != nil {
		defer mu.RUnlock()
		return cached.Content, nil
	}
	mu.RUnlock()

	embeddedPath := "assets/" + filename
	data, err := embeddedAssets.ReadFile(embeddedPath)
	if err != nil {
		return "", fmt.Errorf("读取嵌入提示词资产失败 (%s): %w", filename, err)
	}

	sanitized, err := sanitizeUTF8Content(data)
	if err != nil {
		return "", fmt.Errorf("校验嵌入提示词资产编码失败 (%s): %w", filename, err)
	}

	mu.Lock()
	cache[filename] = &PromptMetadata{
		ID:           normID,
		Filename:     filename,
		Content:      sanitized,
		LastModified: time.Time{},
	}
	mu.Unlock()

	return sanitized, nil
}

// MustGetPrompt 获取提示词文本，若不存在则 panic
func MustGetPrompt(promptID string) string {
	content, err := GetPrompt(promptID)
	if err != nil {
		panic(err)
	}
	return content
}

// HasPrompt 判断提示词 ID 是否注册在 Vault 中
func HasPrompt(promptID string) bool {
	normID := strings.TrimSpace(strings.ToLower(promptID))
	_, exists := promptMapping[normID]
	return exists
}

// ListPromptIDs 返回所有已注册的规范化提示词标识
func ListPromptIDs() []string {
	ids := make([]string, 0, len(promptMapping))
	for k := range promptMapping {
		ids = append(ids, k)
	}
	return ids
}

// @opc-adapter: opc-prompt-vault [end]
