package opcvault

// @opc-adapter: prompt-vault-macro-injection [start]

import (
	"bytes"
	"encoding/json"
	"strings"
)

const (
	// HeaderCanvasSystemPromptID 客户端可通过此请求头指定需要服务端注入的提示词资产 ID
	HeaderCanvasSystemPromptID = "X-Canvas-System-Prompt-ID"
	// HeaderVaultPromptID 备用标准请求头标识
	HeaderVaultPromptID = "X-Vault-Prompt-Id"
)

// ChannelAPIFormatForProtocol 以模型协议优先，渠道默认格式兜底计算 API 格式
func ChannelAPIFormatForProtocol(channelDefault string, protocol string) string {
	switch strings.ToLower(strings.TrimSpace(protocol)) {
	case "gemini-veo", "gemini-image":
		return "gemini"
	case "claude-api":
		return "claude"
	case "":
		def := strings.ToLower(strings.TrimSpace(channelDefault))
		if def != "" {
			return def
		}
		return "openai"
	default:
		return "openai"
	}
}

// InjectVaultPromptToRequestBody 针对服务端提示词金库资产执行零泄露动态注入。
// 支持 Claude、Gemini、OpenAI Chat (messages / system / developer)、OpenAI Responses (input)、Completions (prompt)。
// 自动防御非系统角色的宏反射攻击，确保商业资产 100% 仅在系统指令上下文中解开。
func InjectVaultPromptToRequestBody(headerPromptID string, apiFormat string, body []byte) ([]byte, error) {
	headerPromptID = strings.TrimSpace(headerPromptID)
	hasMacro := bytes.Contains(body, []byte(VaultPromptMacroPrefix))
	if headerPromptID == "" && !hasMacro {
		return body, nil
	}

	var jsonMap map[string]interface{}
	if err := json.Unmarshal(body, &jsonMap); err != nil {
		return body, nil
	}

	var headerPromptContent string
	if headerPromptID != "" {
		if content, err := GetPrompt(headerPromptID); err == nil {
			headerPromptContent = content + AntiExtractionDirective
		}
	}

	normFormat := strings.ToLower(strings.TrimSpace(apiFormat))
	// 自适应探测：未显式指定或默认时按结构特征推断
	if normFormat == "" || normFormat == "openai" {
		if _, hasContents := jsonMap["contents"]; hasContents {
			if _, hasMessages := jsonMap["messages"]; !hasMessages {
				normFormat = "gemini"
			}
		} else if _, hasSystem := jsonMap["system"]; hasSystem {
			if _, hasMessages := jsonMap["messages"]; hasMessages {
				hasSystemRole := false
				if msgs, ok := jsonMap["messages"].([]interface{}); ok {
					for _, m := range msgs {
						if mm, ok := m.(map[string]interface{}); ok {
							if r, _ := mm["role"].(string); r == "system" || r == "developer" {
								hasSystemRole = true
								break
							}
						}
					}
				}
				if !hasSystemRole {
					normFormat = "claude"
				}
			}
		}
	}

	switch normFormat {
	case "claude":
		existingSystem, _ := jsonMap["system"].(string)
		if existingSystem != "" {
			existingSystem = ResolvePromptMacros(existingSystem, true)
			if headerPromptContent != "" && !strings.Contains(existingSystem, headerPromptContent) {
				existingSystem = headerPromptContent + "\n\n" + existingSystem
			}
			jsonMap["system"] = existingSystem
		} else if headerPromptContent != "" {
			jsonMap["system"] = headerPromptContent
		}
		// 审查 messages 数组中的非 system 内容，防止用户输入宏反射窃取
		if rawMessages, ok := jsonMap["messages"].([]interface{}); ok {
			for i, rawMsg := range rawMessages {
				if msgMap, ok := rawMsg.(map[string]interface{}); ok {
					if content, ok := msgMap["content"].(string); ok && strings.Contains(content, VaultPromptMacroPrefix) {
						msgMap["content"] = NeutralizeRestrictedMacros(content)
						rawMessages[i] = msgMap
					}
				}
			}
			jsonMap["messages"] = rawMessages
		}

	case "gemini":
		if sysInst, ok := jsonMap["systemInstruction"].(map[string]interface{}); ok {
			if parts, ok := sysInst["parts"].([]interface{}); ok {
				for i, p := range parts {
					if partMap, ok := p.(map[string]interface{}); ok {
						if text, ok := partMap["text"].(string); ok {
							partMap["text"] = ResolvePromptMacros(text, true)
							parts[i] = partMap
						}
					}
				}
				sysInst["parts"] = parts
				jsonMap["systemInstruction"] = sysInst
			}
		} else if headerPromptContent != "" {
			jsonMap["systemInstruction"] = map[string]interface{}{
				"parts": []interface{}{
					map[string]interface{}{"text": headerPromptContent},
				},
			}
		}
		// 审查 contents 数组，防止宏反射
		if contents, ok := jsonMap["contents"].([]interface{}); ok {
			for i, rawItem := range contents {
				if itemMap, ok := rawItem.(map[string]interface{}); ok {
					if parts, ok := itemMap["parts"].([]interface{}); ok {
						for j, p := range parts {
							if partMap, ok := p.(map[string]interface{}); ok {
								if text, ok := partMap["text"].(string); ok && strings.Contains(text, VaultPromptMacroPrefix) {
									partMap["text"] = NeutralizeRestrictedMacros(text)
									parts[j] = partMap
								}
							}
						}
						itemMap["parts"] = parts
						contents[i] = itemMap
					}
				}
			}
			jsonMap["contents"] = contents
		}

	default:
		// 1. messages 结构 (OpenAI Chat Completions)
		if rawMessages, ok := jsonMap["messages"].([]interface{}); ok {
			systemFound := false
			for i, rawMsg := range rawMessages {
				msgMap, ok := rawMsg.(map[string]interface{})
				if !ok {
					continue
				}
				role, _ := msgMap["role"].(string)
				if role == "system" || role == "developer" {
					systemFound = true
					if headerPromptContent != "" {
						if content, ok := msgMap["content"].(string); ok {
							if !strings.Contains(content, headerPromptContent) {
								msgMap["content"] = headerPromptContent + "\n\n" + content
							}
						}
					}
					// 仅且必须仅允许在 system / developer 角色内替换金库宏
					if content, ok := msgMap["content"].(string); ok && strings.Contains(content, VaultPromptMacroPrefix) {
						msgMap["content"] = ResolvePromptMacros(content, true)
						rawMessages[i] = msgMap
					} else if parts, ok := msgMap["content"].([]interface{}); ok {
						for j, p := range parts {
							if partMap, ok := p.(map[string]interface{}); ok {
								if text, ok := partMap["text"].(string); ok && strings.Contains(text, VaultPromptMacroPrefix) {
									partMap["text"] = ResolvePromptMacros(text, true)
									parts[j] = partMap
								}
							}
						}
						msgMap["content"] = parts
						rawMessages[i] = msgMap
					}
				} else {
					// 非 system/developer 消息（如 user / assistant / tool）：严禁展开金库宏，防止恶意用户在输入框通过宏反射窃取系统提示词
					if content, ok := msgMap["content"].(string); ok && strings.Contains(content, VaultPromptMacroPrefix) {
						msgMap["content"] = NeutralizeRestrictedMacros(content)
						rawMessages[i] = msgMap
					} else if parts, ok := msgMap["content"].([]interface{}); ok {
						for j, p := range parts {
							if partMap, ok := p.(map[string]interface{}); ok {
								if text, ok := partMap["text"].(string); ok && strings.Contains(text, VaultPromptMacroPrefix) {
									partMap["text"] = NeutralizeRestrictedMacros(text)
									parts[j] = partMap
								}
							}
						}
						msgMap["content"] = parts
						rawMessages[i] = msgMap
					}
				}
			}

			if !systemFound && headerPromptContent != "" {
				newMessages := make([]interface{}, 0, len(rawMessages)+1)
				newMessages = append(newMessages, map[string]interface{}{
					"role":    "system",
					"content": headerPromptContent,
				})
				newMessages = append(newMessages, rawMessages...)
				rawMessages = newMessages
			}
			jsonMap["messages"] = rawMessages
		}

		// 2. input 结构 (OpenAI Responses API)
		if rawInput, ok := jsonMap["input"].([]interface{}); ok {
			for i, rawMsg := range rawInput {
				if msgMap, ok := rawMsg.(map[string]interface{}); ok {
					role, _ := msgMap["role"].(string)
					isSystemRole := role == "system" || role == "developer"
					if content, ok := msgMap["content"].(string); ok && strings.Contains(content, VaultPromptMacroPrefix) {
						if isSystemRole {
							msgMap["content"] = ResolvePromptMacros(content, true)
						} else {
							msgMap["content"] = NeutralizeRestrictedMacros(content)
						}
						rawInput[i] = msgMap
					} else if parts, ok := msgMap["content"].([]interface{}); ok {
						for j, p := range parts {
							if partMap, ok := p.(map[string]interface{}); ok {
								if text, ok := partMap["text"].(string); ok && strings.Contains(text, VaultPromptMacroPrefix) {
									if isSystemRole {
										partMap["text"] = ResolvePromptMacros(text, true)
									} else {
										partMap["text"] = NeutralizeRestrictedMacros(text)
									}
									parts[j] = partMap
								}
							}
						}
						msgMap["content"] = parts
						rawInput[i] = msgMap
					}
				}
			}
			jsonMap["input"] = rawInput
		} else if inputStr, ok := jsonMap["input"].(string); ok && strings.Contains(inputStr, VaultPromptMacroPrefix) {
			jsonMap["input"] = ResolvePromptMacros(inputStr, true)
		}

		// 3. prompt 结构 (Completions API / 生图 API)
		if promptStr, ok := jsonMap["prompt"].(string); ok && strings.Contains(promptStr, VaultPromptMacroPrefix) {
			jsonMap["prompt"] = ResolvePromptMacros(promptStr, false)
		}

		// 4. top-level system 结构
		if sysStr, ok := jsonMap["system"].(string); ok && strings.Contains(sysStr, VaultPromptMacroPrefix) {
			jsonMap["system"] = ResolvePromptMacros(sysStr, true)
		} else if headerPromptContent != "" && jsonMap["messages"] == nil && jsonMap["system"] == nil {
			jsonMap["system"] = headerPromptContent
		}
	}

	return json.Marshal(jsonMap)
}

// @opc-adapter: prompt-vault-macro-injection [end]
