package opcvault

// @opc-adapter: opc-prompt-vault-test [start]

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestPromptVaultEncoding(t *testing.T) {
	files, err := filepath.Glob(filepath.Join("assets", "*.md"))
	if err != nil || len(files) == 0 {
		// Fallback to embedded filesystem check
		assetNames := []string{
			"creative-reverse.md",
			"creative-replication.md",
			"creation-assistant.md",
			"creation-assistant-reference.md",
			"video-workbench.md",
			"video-reverse-classic.md",
		}
		for _, name := range assetNames {
			data, err := embeddedAssets.ReadFile("assets/" + name)
			if err != nil {
				t.Fatalf("embedded assets 读取失败 %s: %v", name, err)
			}
			if bytes.HasPrefix(data, []byte{0xEF, 0xBB, 0xBF}) {
				t.Errorf("资产 %s 包含了 UTF-8 BOM 头，严禁携带 BOM", name)
			}
			if !utf8.Valid(data) {
				t.Errorf("资产 %s 不是合法的 UTF-8 编码", name)
			}
		}
		return
	}

	for _, file := range files {
		data, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("读取资产文件失败 %s: %v", file, err)
		}
		if bytes.HasPrefix(data, []byte{0xEF, 0xBB, 0xBF}) {
			t.Errorf("文件 %s 包含了 UTF-8 BOM 头，严禁携带 BOM", filepath.Base(file))
		}
		if !utf8.Valid(data) {
			t.Errorf("文件 %s 不是有效的 UTF-8 编码", filepath.Base(file))
		}
	}
}

func TestVaultAllAssetsIntegrity(t *testing.T) {
	requiredIDs := []string{
		"creative-reverse",
		"creative-replication",
		"creation-assistant",
		"creation-assistant-reference",
		"video-workbench",
		"video-reverse-classic",
	}

	for _, id := range requiredIDs {
		t.Run("Asset_"+id, func(t *testing.T) {
			content, err := GetPrompt(id)
			if err != nil {
				t.Fatalf("无法获取资产 %s: %v", id, err)
			}
			if len(content) < 100 {
				t.Fatalf("资产 %s 内容过短 (%d 字节)", id, len(content))
			}
			if strings.HasPrefix(content, "\uFEFF") {
				t.Fatalf("资产 %s 包含了 UTF-8 BOM 头，违反规范", id)
			}
			if !utf8.ValidString(content) {
				t.Fatalf("资产 %s 包含非法的 UTF-8 字符序列", id)
			}
		})
	}
}

func TestCreativeReverseKeywords(t *testing.T) {
	prompt, err := GetPrompt("creative-reverse")
	if err != nil {
		t.Fatalf("获取 creative-reverse 失败: %v", err)
	}

	mustContain := []string{
		"突变轨作为辅助参考候选点",
		"shotType",
		"a-roll",
		"b-roll",
		"l-cut",
		"split",
		"wordTimings",
		"originalMasterSlots",
		"主要物品分析",
		"声画毫秒级锁死与词级时间戳契约",
		"lightingTone",
		"分镜判定必须综合主播语音气口、台词完整性与主体景别转换",
		"三段式微过程",
		"主要物品物理反馈",
		"情绪微表情与眼神轨迹",
		"coreElements",
		"imagePrompt",
		"motionPrompt",
		"空间透视视差",
		"几何稳定性",
		"空间场域与物理环境 (scene)",
		"视听工程特别说明（全片总览）",
		"空间场域与物理光学布光（支持多场景解构）",
	}

	for _, s := range mustContain {
		if !strings.Contains(prompt, s) {
			t.Errorf("creative-reverse 缺失必要关键字: %q", s)
		}
	}

	mustNotContain := []string{
		"hookType",
		"productAnchor",
		"严禁出现任何下游换品",
		"复刻建议或改写脑补",
		"二创复刻与改编策略",
		"| 镜头编号 |",
		"| :--- |",
		"startSec",
		"endSec",
		"durationSec",
		"A photograph captured as a single frame from an iPhone video",
		"The camera slowly pushes in",
	}

	for _, s := range mustNotContain {
		if strings.Contains(prompt, s) {
			t.Errorf("creative-reverse 包含了被禁止的关键字/字段: %q", s)
		}
	}
}

func TestCreativeReplicationKeywords(t *testing.T) {
	prompt, err := GetPrompt("creative-replication")
	if err != nil {
		t.Fatalf("获取 creative-replication 失败: %v", err)
	}

	mustContain := []string{
		"原分镜时长 1:1 继承与多动作高密度法则",
		"真人感口语化台词与去 AI 味红线",
		"单镜头台词字数上限",
		"a-roll",
		"b-roll",
		"l-cut",
		"split",
		"iPhone UGC 实拍四段式",
		"创意提示词 (creativePrompt)：8 维高动态影视级视听工程图纸通用规范",
		"【景别机位与运镜】",
		"【画面多动作推进与对白】",
		"【场景/光线与环境质感】",
		"【情绪/表情/眼神】",
		"【真人感细节与物理动力学】",
		"【音效/BGM】",
		"【声音参考】",
		"brollCoverSlot",
		"targetSlots",
		"人物四视图设定板",
		"商业广告多角度带细节纯白底摄影",
	}

	for _, s := range mustContain {
		if !strings.Contains(prompt, s) {
			t.Errorf("creative-replication 缺失必要关键字: %q", s)
		}
	}
}

func TestHotReload(t *testing.T) {
	tempDir := t.TempDir()
	testAssetPath := filepath.Join(tempDir, "video-reverse-classic.md")

	initialContent := "# 测试经典反推提示词 v1\n这是测试提示词第一版内容。"
	if err := os.WriteFile(testAssetPath, []byte(initialContent), 0644); err != nil {
		t.Fatalf("写入测试资产失败: %v", err)
	}

	SetVaultDir(tempDir)
	defer SetVaultDir("") // 恢复默认

	got1, err := GetPrompt("video-reverse-classic")
	if err != nil {
		t.Fatalf("获取提示词失败: %v", err)
	}
	if got1 != initialContent {
		t.Fatalf("初次获取内容不匹配: got %q, want %q", got1, initialContent)
	}

	// 模拟修改
	updatedContent := "# 测试经典反推提示词 v2 (热更新)\n这是修改后的热更内容。"
	if err := os.WriteFile(testAssetPath, []byte(updatedContent), 0644); err != nil {
		t.Fatalf("更新测试资产失败: %v", err)
	}

	got2, err := GetPrompt("video-reverse-classic")
	if err != nil {
		t.Fatalf("热更获取提示词失败: %v", err)
	}
	if got2 != updatedContent {
		t.Fatalf("热更内容未生效: got %q, want %q", got2, updatedContent)
	}
}

// @opc-adapter: opc-prompt-vault-test [end]
