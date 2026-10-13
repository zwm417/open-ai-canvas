import type { ReferenceImage } from "@/types/image";
import { resolveResourceUrl } from "@/services/api/resources";
import { peekLocalFirstMedia } from "@/services/local-first-media-resolver";
import type { ActiveSlotFile, WorkbenchAssembleResult, WorkbenchSkill } from "../types/skill-contract";

export function assembleWorkbenchPrompt(params: {
    skill?: WorkbenchSkill | null;
    userPrompt: string;
    slotFiles: Record<string, ActiveSlotFile | undefined>;
    slotFilesMap?: Record<string, ActiveSlotFile[]>;
}): WorkbenchAssembleResult {
    const { skill, userPrompt, slotFiles, slotFilesMap } = params;

    // 通用模式：无技能选中时直接放行
    if (!skill) {
        return {
            finalPrompt: userPrompt.trim(),
            referenceImages: [],
            slotMappings: [],
        };
    }

    // 按技能槽位声明的严格顺序收集已上传的素材
    const slotMappings: Array<{ slotId: string; label: string; index: number }> = [];
    const referenceImages: ReferenceImage[] = [];
    const addedFileIds = new Set<string>();

    skill.uploadSlots.forEach((slot) => {
        const file = slotFiles[slot.id];
        if (file && (file.dataUrl || file.previewUrl || file.storageKey)) {
            const index = referenceImages.length + 1;
            slotMappings.push({
                slotId: slot.id,
                label: slot.semanticTag || slot.label,
                index,
            });
            const effectiveUrl = file.dataUrl || file.previewUrl || (file.storageKey ? (peekLocalFirstMedia(file.storageKey) || resolveResourceUrl(file.storageKey)) : "");
            referenceImages.push({
                id: file.id,
                name: file.name || `${slot.id}-${index}.png`,
                type: file.mimeType || "image/png",
                dataUrl: effectiveUrl,
                storageKey: file.storageKey,
                width: file.width,
                height: file.height,
                bytes: file.bytes,
            });
            addedFileIds.add(file.id);
        }

        // 若槽位内包含合并折叠的多张额外素材，也作为辅助参考追加
        if (slotFilesMap && slotFilesMap[slot.id]) {
            slotFilesMap[slot.id].forEach((extraFile) => {
                if (extraFile && (extraFile.dataUrl || extraFile.previewUrl || extraFile.storageKey) && !addedFileIds.has(extraFile.id)) {
                    const extraUrl = extraFile.dataUrl || extraFile.previewUrl || (extraFile.storageKey ? (peekLocalFirstMedia(extraFile.storageKey) || resolveResourceUrl(extraFile.storageKey)) : "");
                    referenceImages.push({
                        id: extraFile.id,
                        name: extraFile.name || `${slot.id}-extra.png`,
                        type: extraFile.mimeType || "image/png",
                        dataUrl: extraUrl,
                        storageKey: extraFile.storageKey,
                        width: extraFile.width,
                        height: extraFile.height,
                        bytes: extraFile.bytes,
                    });
                    addedFileIds.add(extraFile.id);
                }
            });
        }
    });

    // 1. 槽位映射标签
    const mappingText = slotMappings.length
        ? `参考素材映射：${slotMappings.map((m) => `@图片${m.index}为【${m.label}】`).join("，")}。`
        : "";

    // 2. VOZEB 工业级核心指令与规避
    const baseInstruction = skill.instructions ? `核心工业级规范：\n${skill.instructions}` : "";
    // @opc-feature: prompt-vault-client [start]
    // 商业安全防御：对用户手填内容进行宏中和，杜绝仿冒服务端金库宏注入
    const safeUserPrompt = userPrompt.replace(/__VAULT_PROMPT__:[a-zA-Z0-9-_]+/g, "[USER_TEXT]");
    // @opc-feature: prompt-vault-client [end]
    const userInstruction = safeUserPrompt.trim() ? `用户补充指令：\n${safeUserPrompt.trim()}` : "";
    const avoidText = skill.avoid?.length ? `避免：${skill.avoid.join("；")}` : "";
    const consistencyRule = `一致性约束：严格锁定参考主体身份特征与物理结构，光影与环境色温自然融合，杜绝违背现实的形变。`;

    // @opc-feature: image-workbench-typography [start]
    // 3. 针对现代高精度图文排版模型（如 gpt-image-2.5）的字形与版式渲染增强
    const hasTypographyNeed =
        skill.categoryId === "social" ||
        skill.categoryId === "ecommerce" ||
        skill.id.includes("cover") ||
        skill.id.includes("thumbnail") ||
        skill.id.includes("ad-") ||
        skill.id.includes("poster") ||
        skill.id.includes("listing") ||
        Boolean(userPrompt.match(/标题|文案|大字|字样|标语|Slogan|Logo|参数|卖点|排版|文字|英文字符|贴纸|徽章/i));

    const typographyRule = hasTypographyNeed
        ? `排版与文字规范：依托顶尖字形渲染与商业版式构建能力，画面中的主副标题、痛点标签、卖点引线、数字指标及行动徽章必须字形工整、层级分明、边缘清晰锐利。中英文字符严格准确拼写，杜绝错别字、乱码或残缺笔画；文字与主体背景保持高对比度与呼吸感，确保在移动端信息流或缩略图尺寸下一目了然。`
        : "";
    // @opc-feature: image-workbench-typography [end]

    // 若用户提示词已包含该工作流目标或已完成智能重塑，直接采用
    if (userPrompt.includes(`【工作流目标：${skill.name}】`)) {
        return {
            finalPrompt: userPrompt.trim(),
            referenceImages,
            slotMappings,
        };
    }

    const sections = [
        `【工作流目标：${skill.name}】`,
        mappingText,
        baseInstruction,
        userInstruction,
        typographyRule,
        avoidText,
        consistencyRule,
    ].filter(Boolean);

    const finalPrompt = sections.join("\n\n");

    return {
        finalPrompt,
        referenceImages,
        slotMappings,
    };
}
