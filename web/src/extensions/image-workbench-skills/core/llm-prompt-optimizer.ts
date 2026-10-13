import type { AiConfig } from "@/stores/use-config-store";
import { requestImageQuestion } from "@/services/api/image";
import type { ActiveSlotFile, WorkbenchSkill } from "../types/skill-contract";
import { assembleWorkbenchPrompt } from "./prompt-assembler";

export interface SkillPromptOptimizeParams {
    skill?: WorkbenchSkill | null;
    userPrompt: string;
    slotFiles: Record<string, ActiveSlotFile | undefined>;
    slotFilesMap?: Record<string, ActiveSlotFile[]>;
    targetModel?: string;
    config: AiConfig;
    signal?: AbortSignal;
    onDelta?: (chunk: string) => void;
}

export interface SkillPromptOptimizeResult {
    optimizedPrompt: string;
    isAiGenerated: boolean;
    error?: string;
}

// @opc-feature: prompt-vault-client [start]
// 商业安全防御：提示词优化导演 System Prompt 已迁入服务端金库，客户端仅保留宏标识
const SYSTEM_PROMPT = "__VAULT_PROMPT__:image-prompt-optimizer";
// @opc-feature: prompt-vault-client [end]

export async function optimizeSkillPrompt(params: SkillPromptOptimizeParams): Promise<SkillPromptOptimizeResult> {
    const { skill, userPrompt, slotFiles, slotFilesMap, targetModel, config, signal, onDelta } = params;

    // 先计算基础结构与槽位映射
    const baseAssembled = assembleWorkbenchPrompt({
        skill,
        userPrompt,
        slotFiles,
        slotFilesMap,
    });

    // 检查是否有配置文本模型渠道
    const hasTextConfig = Boolean(
        (config.apiKey && config.apiKey.trim()) ||
        (config.baseUrl && config.baseUrl.trim())
    );

    if (!hasTextConfig) {
        // 未配置文本模型时，直接使用优质结构化组装结果
        return {
            optimizedPrompt: baseAssembled.finalPrompt,
            isAiGenerated: false,
        };
    }

    const slotMappingsText = baseAssembled.slotMappings.length
        ? baseAssembled.slotMappings.map((m) => `@图片${m.index}为【${m.label}】`).join("，")
        : "无";

    const effectiveSystemPrompt = [
        SYSTEM_PROMPT,
        skill?.instructions ? `【当前应用的工作流技能规范】：\n${skill.instructions}` : "",
    ].filter(Boolean).join("\n\n");

    const userMessage = [
        `【工作流卡片目标】：${skill ? skill.name : "自由生图"}`,
        skill?.avoid?.length ? `【需规避瑕疵】：${skill.avoid.join("；")}` : "",
        `【已上传参考素材映射】：${slotMappingsText}`,
        `【目标生图模型】：${targetModel || "通用图片模型"}`,
        `【用户手动输入需求】：${userPrompt.trim() || "（用户未输入额外文字，请根据上述工作流目标与素材槽位生成最理想的画面呈现）"}`,
        "",
        "请将上述要素深度融合，直接输出最终用于生图的最优提示词正文：",
    ].filter(Boolean).join("\n");

    try {
        const rawResponse = await requestImageQuestion(
            config,
            [
                { role: "system", content: effectiveSystemPrompt },
                { role: "user", content: userMessage },
            ],
            onDelta || (() => {}),
            // @opc-feature: feature-credits [start]
            { signal, scene: "image_prompt_optimize" }
            // @opc-feature: feature-credits [end]
        );

        const cleaned = rawResponse
            .trim()
            .replace(/^\`\`\`[a-zA-Z]*\s*/i, "")
            .replace(/\s*\`\`\`$/, "")
            .trim();

        if (cleaned && cleaned.length > 5) {
            return {
                optimizedPrompt: cleaned,
                isAiGenerated: true,
            };
        }

        return {
            optimizedPrompt: baseAssembled.finalPrompt,
            isAiGenerated: false,
        };
    } catch (err) {
        console.warn("[SkillPromptOptimizer] LLM 融合重塑失败，回退到结构化拼装:", err);
        return {
            optimizedPrompt: baseAssembled.finalPrompt,
            isAiGenerated: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
