package opcinfinite

import (
	"strings"
	"testing"
)

func TestCreativeReverseDeconstructSystemPrompt(t *testing.T) {
	prompt := GetCreativeReverseDeconstructSystemPrompt()

	// 1. 验证必须包含的视听与管线关键字（对齐 opc-vault 最新工业级反推标准）
	mustContain := []string{
		"突变轨作为辅助参考候选点",
		"shotType",
		"a-roll",
		"b-roll",
		"l-cut",
		"split",
		"wordTimings",
		"分镜判定必须综合主播语音气口、台词完整性与主体景别转换",
		"三段式微过程",
		"主要物品物理反馈",
		"情绪微表情与眼神轨迹",
		"逐镜头全息工程图纸",
		"全片视听基因与宏观架构总览",
		"注意力动力学与商业转化机制",
		"空间场域构型、物理光学与美术置景",
		"影视表演动力学与微表情指导",
		"真人实拍物理质感与连续性全息审计",
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
