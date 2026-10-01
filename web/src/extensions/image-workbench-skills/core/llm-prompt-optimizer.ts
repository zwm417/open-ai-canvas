import type { AiConfig } from "@/stores/use-config-store";
import { requestImageQuestion } from "@/services/api/image";
import type { ActiveSlotFile, WorkbenchSkill } from "../types/skill-contract";
import { assembleWorkbenchPrompt } from "./prompt-assembler";

export interface SkillPromptOptimizeParams {
    skill?: WorkbenchSkill | null;
    userPrompt: string;
    slotFiles: Record<string, ActiveSlotFile | undefined>;
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

const SYSTEM_PROMPT = `你是视觉艺术总监与生图提示词导演 (Prompt Director)。
你的核心职责：将用户的【原始输入意图】、当前【工作流卡片规范与内置提示词】以及【参考素材插槽映射】进行深度融合与提炼，生成一段可直接交付给生图模型的最优终极正向提示词。

【严格执行规则】：
1. 意图保真：忠实保留用户明确输入的主体特征、动作、核心视觉意图。
2. 深度融合内置指令：将工作流卡片中的光线（明暗/光源/色温）、构图（视角/景别/比例）、材质纹理（皮肤/面料/反光）与环境氛围有机融入用户画面中，而不是生硬罗列标题。
3. 素材槽位绝对保留：若存在参考素材映射（如 @图片1、@图片2），必须在对应的画面描述中精准保留 @图片1 / @图片2 标记（例如："@图片1 中的主体放置在..."），绝对不能丢失或篡改槽位编号。
4. 纯净输出：直接输出融合优化后的完整提示词正文，严禁包含任何前缀、问候语、额外解释或 Markdown 代码块标记（如 \`\`\` ）。`;

export async function optimizeSkillPrompt(params: SkillPromptOptimizeParams): Promise<SkillPromptOptimizeResult> {
    const { skill, userPrompt, slotFiles, targetModel, config, signal, onDelta } = params;

    // 先计算基础结构与槽位映射
    const baseAssembled = assembleWorkbenchPrompt({
        skill,
        userPrompt,
        slotFiles,
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

    const userMessage = [
        `【工作流卡片目标】：${skill ? skill.name : "自由生图"}`,
        skill?.instructions ? `【卡片内置核心规范与风格】：${skill.instructions}` : "",
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
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userMessage },
            ],
            onDelta || (() => {}),
            { signal }
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
