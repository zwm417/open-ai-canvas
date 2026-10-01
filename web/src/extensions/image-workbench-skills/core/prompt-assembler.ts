import type { ReferenceImage } from "@/types/image";
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
        if (file && file.dataUrl) {
            const index = referenceImages.length + 1;
            slotMappings.push({
                slotId: slot.id,
                label: slot.semanticTag || slot.label,
                index,
            });
            referenceImages.push({
                id: file.id,
                name: file.name || `${slot.id}-${index}.png`,
                type: file.mimeType || "image/png",
                dataUrl: file.dataUrl,
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
                if (extraFile && extraFile.dataUrl && !addedFileIds.has(extraFile.id)) {
                    referenceImages.push({
                        id: extraFile.id,
                        name: extraFile.name || `${slot.id}-extra.png`,
                        type: extraFile.mimeType || "image/png",
                        dataUrl: extraFile.dataUrl,
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
    const userInstruction = userPrompt.trim() ? `用户补充指令：\n${userPrompt.trim()}` : "";
    const avoidText = skill.avoid?.length ? `避免：${skill.avoid.join("；")}` : "";
    const consistencyRule = `一致性约束：严格锁定参考主体身份特征与物理结构，光影与环境色温自然融合，杜绝违背现实的形变。`;

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
