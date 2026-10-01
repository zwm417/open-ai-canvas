import { getVaultPromptSync, VAULT_PROMPT_IDS } from "@/services/api/prompt-vault";
import { resolveVideoSkillDirectionText } from "../catalog/video-skill-directions";
import { segmentCreationAssistantTimeline, formatCreationAssistantSegmentPlan } from "@/lib/creation-assistant-segmentation";
import { resolveChannelVideoModelMaxDuration, type modelCapabilityConfigFor } from "@/lib/model-capabilities";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio } from "@/types/media";

export type VideoWorkbenchPromptInput = {
    skillId: string;
    skillName?: string;
    durationSec: number;
    videoModel?: string;
    videoModelMaxDurationSec?: number;
    config?: Parameters<typeof modelCapabilityConfigFor>[0];
    uploadedImages?: ReferenceImage[];
    uploadedAudios?: ReferenceAudio[];
    notes?: string;
    inspirationPrompt?: string;
    language?: "zh" | "en";
};

export type VideoWorkbenchAssetRef = {
    ref: string;
    mediaType: "image" | "audio" | "video";
    fileId: string;
    name: string;
};

export type VideoWorkbenchPromptBundle = {
    systemPrompt: string;
    userPrompt: string;
    fullPrompt: string;
    assetReferenceMap: VideoWorkbenchAssetRef[];
};

/**
 * 组装生视频工作台单请求提示词
 */
export function buildVideoWorkbenchPrompts(input: VideoWorkbenchPromptInput): VideoWorkbenchPromptBundle {
    // 1. 构建素材引用表
    const images = input.uploadedImages || [];
    const audios = input.uploadedAudios || [];

    const assetReferenceMap: VideoWorkbenchAssetRef[] = [];
    images.forEach((img, idx) => {
        assetReferenceMap.push({
            ref: `@图片${idx + 1}`,
            mediaType: "image",
            fileId: img.id,
            name: img.name || `图片_${idx + 1}.png`,
        });
    });
    audios.forEach((aud, idx) => {
        assetReferenceMap.push({
            ref: `@音频${idx + 1}`,
            mediaType: "audio",
            fileId: aud.id,
            name: aud.name || `音频_${idx + 1}.mp3`,
        });
    });

    // 2. 视频模型能力与物理切片计划计算
    const model = input.videoModel || "seedance-2.0";
    const maxDurationSec = input.videoModelMaxDurationSec || (input.config ? resolveChannelVideoModelMaxDuration(input.config, model) : 10);
    const targetDurationSec = Math.max(1, Math.round(Number(input.durationSec) || 15));
    const segmentPlan = segmentCreationAssistantTimeline(targetDurationSec, maxDurationSec);

    // 3. 注入卡片 5 维方向指引至第一部分
    const cardDirectionText = resolveVideoSkillDirectionText(input.skillId, input.skillName);

    let systemPrompt = getVaultPromptSync(VAULT_PROMPT_IDS.VIDEO_WORKBENCH);
    const modeRegex = /## 本次创作模式[\s\S]*?(?=\n---)/;
    if (modeRegex.test(systemPrompt)) {
        systemPrompt = systemPrompt.replace(modeRegex, cardDirectionText);
    } else {
        systemPrompt = `${systemPrompt}\n\n${cardDirectionText}`;
    }

    // 4. 构建第三部分动态上下文
    const materialSummaryLines: string[] = [];
    if (assetReferenceMap.length > 0) {
        materialSummaryLines.push(
            `本次共上传 ${images.length} 张图片参考与 ${audios.length} 个音频特征。`,
            "请在第一步思考推演（<thinking>）中通观全批素材，提取客观物理特征（颜色、材质、形态、动静状态、空间环境），并按照素材引用表的 @图片N / @音频N 赋予其分镜角色身份（人物、商品、空间、道具、背景声等）。",
        );
    } else {
        materialSummaryLines.push("本次暂未上传物理素材文件。请依据卡片创作模式方向、行业通用常识与用户补充，构思符合工业级标准的真实生活切片与分镜细节。");
    }

    const notesText = input.notes?.trim() || "无特定补充，请在所选创作模式方向下自由构思高质感叙事与分镜。";

    const dynamicContextParts: string[] = [
        `【本次创作模式与商业定位】\n${cardDirectionText}`,
        `【素材引用表】\n<asset_reference_map>\n${JSON.stringify(assetReferenceMap)}\n</asset_reference_map>\n引用表由系统生成，是素材编号和文件身份的唯一来源。脚本中凡涉及出镜人物、核心商品、道具或背景音，必须精准标注对应的 @图片N 或 @音频N 标记，保持强锚定关系。`,
        `【素材资料与视觉事实透视】\n${materialSummaryLines.join("\n")}`,
    ];

    // 若传入了创作灵感，在【素材资料】之后、【用户创意输入】之前注入专属视听与叙事参考槽位
    if (input.inspirationPrompt && input.inspirationPrompt.trim()) {
        dynamicContextParts.push(
            `【引入创作灵感（视听美学与叙事参考）】\n参考内容：\n"""\n${input.inspirationPrompt.trim()}\n"""\n\n【灵感融合与借代指引】：\n1. 叙事与情境深度借用（全面赋能）：\n   - 该灵感既可作为【镜头运镜与视听美学】基准，也可作为本次分镜的【剧情原型、叙事结构或反转框架】。\n   - 若灵感包含完整的故事脉络、情境冲突、戏剧性对白或反转桥段，完全可以借用其情节演进与戏剧节奏。\n2. 实体与角色自然转译（借灵感之壳，载真实素材）：\n   - 严禁生搬硬套灵感中与本次素材无关的特定虚构品牌或道具；\n   - 必须将灵感中的情境角色、核心道具与事件冲突，自然“转译/映射”到本次【素材资料】中的真实人物与核心商品上（例如：将灵感故事中的“神秘解药”巧妙替换为本次的“护肤精华”，让真实商品成为推动灵感剧情发展的关键要素）。\n3. 商业驱动契合（借剧情之势，达卡片之功）：\n   - 当借用灵感剧情推进时，故事的高潮、反转或痛点解决，应顺应【本次创作模式】的观众关系与核心驱动，确保剧情好看的同时自然达成商业转化。\n4. 用户意志绝对优先：\n   - 若【用户创意输入】中对灵感有明确指令（例如“按这个故事拍”、“只参考开场运镜”、“把结局改掉”等），必须无条件以用户的具体要求为最高执行准则。`,
        );
    }

    dynamicContextParts.push(
        `【用户创意输入与特别要求】\n${notesText}\n（重要：若用户在输入中显式提及、@引用了某项素材、强调了某种风格或对灵感提出了具体修改要求，分镜中必须优先落实该意图）。`,
        `【视频生成能力与分段计划】\n目标总时长：${targetDurationSec} 秒\n视频生成模型：${model}\n单视频段生成上限：${maxDurationSec} 秒\n物理分段计划（共 ${segmentPlan.length} 段）：\n${formatCreationAssistantSegmentPlan(segmentPlan)}\n（注：各分段起止时间由代码精确分配，在脚本的【生成分段与拼接】模块中按原值输出，分段之间必须设计可执行的镜头物理接续定格点）。`,
        `【语言与国际化输出策略】\n目标呈现语言：${input.language === "en" ? "英文" : "中文"}\n严格执行语言隔离底线：所有技术控制字段、景别、运镜、光影色温、声音描述与分镜表格说明强制 100% 使用中文；目标语言仅控制观众可见的标题、旁白、人物对白、结尾卡与 CTA。`,
        "请依据上述系统提示词规则、本次创作模式方向、素材引用表与分段计划，首先在 <thinking>...</thinking> 内部完成严密的三步思考推演，随后直接输出完整的 Seedance 2.0 规范脚本文本。",
    );

    const userPrompt = dynamicContextParts.join("\n\n");

    // 替换模板中的动态插槽，形成完整的独立 fullPrompt
    const fullPrompt = systemPrompt.includes("{{DYNAMIC_CONTEXT_INJECTION_SLOT}}")
        ? systemPrompt.replace("{{DYNAMIC_CONTEXT_INJECTION_SLOT}}", userPrompt)
        : `${systemPrompt}\n\n---\n\n${userPrompt}`;

    // 清理 systemPrompt 中的占位槽，避免未解析占位符泄漏给大模型
    const cleanedSystemPrompt = systemPrompt.replace(
        "{{DYNAMIC_CONTEXT_INJECTION_SLOT}}",
        "（详见下方用户消息中注入的实时动态上下文与素材引用表）",
    );

    return {
        systemPrompt: cleanedSystemPrompt,
        userPrompt,
        fullPrompt,
        assetReferenceMap,
    };
}
