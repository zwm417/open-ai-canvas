import type { AiConfig } from "@/stores/use-config-store";
import { requestImageQuestion } from "@/services/api/image";
import { resolveDualTextForSpeech } from "@/extensions/opc-infinite/prompts/hypit-director-prompts";

export interface VoiceScriptRewriteParams {
    originalText: string;
    speaker?: string;
    tone?: string;
    config: AiConfig;
    signal?: AbortSignal;
    onDelta?: (chunk: string) => void;
}

export interface VoiceScriptRewriteResult {
    rewrittenText: string;
    originalCount: number;
    newCount: number;
    characterDiff: number;
    success: boolean;
    error?: string;
}

export const VOICE_REWRITE_SYSTEM_PROMPT = `你是一位顶尖影视配音编导与口语播报专家。
你的任务：将给定的分镜原文台词改写为更自然流畅、更具口语节奏感和感染力的播报文案。

【绝对硬性红线与约束】：
1. 语意与逻辑连贯：改写必须严格忠于原剧情节意图与说话人角色，前后分镜呼应，绝不擅自增加或删减关键业务信息。
2. 字数极度严苛限制（核心红线）：
   改写后的正文字数（去除空格标点后的字数）必须与原文台词字数严格保持在【±2 字以内】！
   - 例如：原文去除空格标点后为 18 字，改写后的文本必须在 16 ~ 20 字之间；
   - 严禁大幅扩充或大幅精简，否则将导致音视频画面分镜严重脱节！
3. 纯净输出：仅输出改写后的最终台词正文，严禁输出任何问候、引号、前缀说明或字数标注。`;

/**
 * 统计台词中的有效字符数（去除空格标点与特殊符号，统计有效汉字与字母数字）
 */
export function countScriptCharacters(text: string): number {
    if (!text) return 0;
    const spoken = resolveDualTextForSpeech(text);
    return spoken.replace(/[\s\p{P}\p{S}]/gu, "").length;
}

const FILLER_WORDS = ["呢", "啦", "哦", "啊", "呀", "吧", "真的", "十分", "非常", "同时", "并且", "那么", "而且", "随后", "就是", "其实"];

/**
 * 算法级硬核防线：确保改写文本与原文有效字符数之差严格在 ±maxDiff 以内（默认 ±2 字）
 */
export function enforceCharacterCountDifference(rewritten: string, target: number | string, maxDiff = 2): string {
    let cleaned = rewritten.replace(/^["'“‘\s]+|["'”’\s]+$/g, "").trim();
    if (!cleaned) return cleaned;
    const targetCount = typeof target === "number" ? target : countScriptCharacters(target);
    if (targetCount <= 0) return cleaned;

    const minAllowed = Math.max(1, targetCount - maxDiff);
    const maxAllowed = targetCount + maxDiff;

    let currentCount = countScriptCharacters(cleaned);

    // 已经在允许的 ±2 范围内，直接返回
    if (currentCount >= minAllowed && currentCount <= maxAllowed) {
        return cleaned;
    }

    // 超出上限：需要精准删减冗余字
    if (currentCount > maxAllowed) {
        let trimmed = cleaned;
        // 尝试从后向前剔除语气助词或冗余副词
        for (const filler of FILLER_WORDS) {
            if (countScriptCharacters(trimmed) <= maxAllowed) break;
            const idx = trimmed.lastIndexOf(filler);
            if (idx >= 0) {
                trimmed = trimmed.slice(0, idx) + trimmed.slice(idx + filler.length);
            }
        }
        // 如果依然超长，安全截断到 maxAllowed，并清理末尾多余标点
        if (countScriptCharacters(trimmed) > maxAllowed) {
            let result = "";
            let counted = 0;
            for (const char of trimmed) {
                result += char;
                if (countScriptCharacters(char) > 0) {
                    counted += 1;
                    if (counted >= maxAllowed) break;
                }
            }
            trimmed = result.replace(/[,，、;；:：\s]+$/, "") + "。";
        }
        return trimmed;
    }

    // 低于下限：轻量补充口语化语气词或平滑润色
    if (currentCount < minAllowed) {
        let diffNeeded = minAllowed - currentCount;
        let padded = cleaned.replace(/[。！!？?\s]+$/, "");
        const fillers = ["其实", "真的", "非常", "那么", "十分", "而且", "随后", "就是"];
        while (diffNeeded > 2) {
            const filler = fillers.find((f) => countScriptCharacters(f) <= diffNeeded) || "呢";
            padded += filler;
            diffNeeded -= countScriptCharacters(filler);
        }
        if (diffNeeded === 1) {
            padded += "呀！";
        } else if (diffNeeded === 2) {
            padded += "啦哦！";
        } else {
            padded += "！";
        }
        return padded;
    }

    return cleaned;
}

export async function rewriteVoiceScript(params: VoiceScriptRewriteParams): Promise<VoiceScriptRewriteResult> {
    const { originalText, speaker, tone, config, signal, onDelta } = params;
    const trimmedOriginal = originalText.trim();
    const originalCount = countScriptCharacters(trimmedOriginal);

    if (!trimmedOriginal) {
        return {
            rewrittenText: "",
            originalCount: 0,
            newCount: 0,
            characterDiff: 0,
            success: false,
            error: "原文台词为空，无法改写",
        };
    }

    // 检查是否有可用配置
    const hasConfig = Boolean((config.apiKey && config.apiKey.trim()) || (config.baseUrl && config.baseUrl.trim()));
    if (!hasConfig) {
        return {
            rewrittenText: trimmedOriginal,
            originalCount,
            newCount: originalCount,
            characterDiff: 0,
            success: false,
            error: "请先在右上角配置大模型 API Key",
        };
    }

    const minTarget = Math.max(1, originalCount - 2);
    const maxTarget = originalCount + 2;

    const userPrompt = [
        `【说话人/角色】：${speaker || "旁白/主播"}`,
        `【情绪与语调】：${tone || "自然亲和"}`,
        `【原文台词】：${trimmedOriginal}`,
        `【原文有效字数】：${originalCount} 字`,
        `【字数硬性红线】：改写后字数必须在【${minTarget} ~ ${maxTarget} 字】之间（与原文严格在 ±2 字以内），严禁多字或少字！`,
        "",
        "请直接输出符合上述字数要求的最优口播改写台词：",
    ].join("\n");

    try {
        const rawResponse = await requestImageQuestion(
            config,
            [
                { role: "system", content: VOICE_REWRITE_SYSTEM_PROMPT },
                { role: "user", content: userPrompt },
            ],
            onDelta || (() => {}),
            // @opc-feature: feature-credits [start]
            { signal, scene: "voice_script_rewrite" }
            // @opc-feature: feature-credits [end]
        );

        let cleaned = rawResponse
            .trim()
            .replace(/^```[a-zA-Z]*\s*/i, "")
            .replace(/\s*```$/, "")
            .replace(/^["'“‘\s]+|["'”’\s]+$/g, "")
            .trim();

        if (!cleaned) {
            cleaned = trimmedOriginal;
        }

        // 经过算法级 ±2 字数防线矫正
        const enforced = enforceCharacterCountDifference(cleaned, originalCount, 2);
        const newCount = countScriptCharacters(enforced);
        const characterDiff = newCount - originalCount;

        return {
            rewrittenText: enforced,
            originalCount,
            newCount,
            characterDiff,
            success: true,
        };
    } catch (err) {
        return {
            rewrittenText: trimmedOriginal,
            originalCount,
            newCount: originalCount,
            characterDiff: 0,
            success: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
