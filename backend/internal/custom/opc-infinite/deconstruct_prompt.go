package opcinfinite

// @opc-adapter: creative-reverse-deconstruct-prompt [start]

import (
	opcvault "infinite-canvas/backend/internal/custom/opc-vault"
)

// CreativeReverseDeconstructSystemPrompt 创意反推（逐镜头全息视听解构）标准系统提示词。
// 遵循商业机密与资产隔离规范，提示词物理固化于后端扩展专区，由统一资产金库 opc-vault 提供纯正 UTF-8 运行时管理与开发态热更。
var CreativeReverseDeconstructSystemPrompt = opcvault.MustGetPrompt("creative-reverse")

// GetCreativeReverseDeconstructSystemPrompt 提供动态只读访问方法（支持开发态秒级热重载）
func GetCreativeReverseDeconstructSystemPrompt() string {
	prompt, err := opcvault.GetPrompt("creative-reverse")
	if err != nil {
		return CreativeReverseDeconstructSystemPrompt
	}
	return prompt
}

// @opc-adapter: creative-reverse-deconstruct-prompt [end]
