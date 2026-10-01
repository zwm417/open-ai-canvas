import type { ReferenceImage } from "@/types/image";

export function imageReferenceLabel(index: number) {
    return `图片${index + 1}`;
}

// @opc-feature: image-workbench-skills [start]
export function buildImageReferencePromptText(prompt: string, references: ReferenceImage[]) {
    const text = prompt.trim();
    if (!references.length) return text;
    // 如果提示词中已经包含【工作流目标】或【参考素材映射】或已带 @图片 标签，说明提示词已结构化组装完毕，无需重复拼装头部
    if (text.includes("【工作流目标") || text.includes("参考素材映射") || text.includes("@图片")) {
        return text;
    }
    const labels = references.map((_, index) => imageReferenceLabel(index));
    return `[${labels.join("、")}] ${text}`;
}
// @opc-feature: image-workbench-skills [end]
