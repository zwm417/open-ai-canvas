package opcinfinite

import (
	"strings"
	"testing"
)

func TestCreativeReverseDeconstructSystemPrompt(t *testing.T) {
	prompt := GetCreativeReverseDeconstructSystemPrompt()

	// 1. 验证必须包含的视听与管线关键字
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
		"三段式微过程",
		"主要物品物理反馈",
		"情绪微表情与眼神轨迹",
		"coreElements",
		"imagePrompt",
		"motionPrompt",
		"空间透视视差",
		"几何稳定性",
	}

	for _, str := range mustContain {
		if !strings.Contains(prompt, str) {
			t.Errorf("CreativeReverseDeconstructSystemPrompt 缺少必要关键字: %q", str)
		}
	}

	// 2. 验证严禁出现的换品、脑补与过时字段
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

	for _, str := range mustNotContain {
		if strings.Contains(prompt, str) {
			t.Errorf("CreativeReverseDeconstructSystemPrompt 包含了禁用词/过时字段: %q", str)
		}
	}
}
