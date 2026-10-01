import type { ReferenceImage } from "@/types/image";

export type SlotIconType =
    | "model"
    | "top"
    | "bottom"
    | "face"
    | "product"
    | "background"
    | "fabric"
    | "print"
    | "room"
    | "furniture"
    | "tile"
    | "material"
    | "craft"
    | "character"
    | "general";

export type UploadSlotDefinition = {
    id: string;
    label: string;
    iconType: SlotIconType;
    optional?: boolean;
    maxCount?: number;
    description?: string;
    semanticTag: string; // e.g. "模特", "上身/全身装", "下装", "产品", "人脸", "背景", "面料", "印花"
};

export type SkillCategory = {
    id: string;
    name: string;
    iconName?: string;
    order?: number;
    pluginId?: string;
};

export type WorkbenchSkill = {
    id: string;
    categoryId: string;
    secondaryCategoryIds?: string[];
    name: string;
    subtitle: string;
    description: string;
    avatarUrl?: string;
    badgeIcon?: "image" | "smile" | "sparkles" | "shirt" | "shopping-bag";
    isRecommended?: boolean;
    order?: number;
    defaultCount?: number; // 工作流约定默认生成张数（未指定默认为 1）
    maxFiles?: number; // total references limit, e.g. 3, 6, 9
    uploadSlots: UploadSlotDefinition[];
    placeholder: string;
    defaultPrompt?: string;
    instructions: string; // VOZEB industry standard rules
    avoid?: string[]; // Avoid constraints
    keywords?: string[];
    showcaseTitle: string; // e.g. "服装上身效果示例"
    showcaseSubtitle: string; // e.g. "替换模特身上的服装衣物"
    showcaseImageUrl: string; // High-res Before/After comparison image
    showcaseBeforeLabel?: string;
    showcaseAfterLabel?: string;
};

export type ActiveSlotFile = {
    id: string;
    slotId: string;
    name: string;
    dataUrl: string;
    previewUrl: string;
    storageKey?: string;
    file?: File;
    width?: number;
    height?: number;
    bytes?: number;
    mimeType?: string;
};

export interface SlotFilesContainer {
    files: ActiveSlotFile[];
    activeId?: string; // 当前槽位生效的主图 ID，默认取 files[0]?.id
}

export type WorkbenchAssembleResult = {
    finalPrompt: string;
    referenceImages: ReferenceImage[];
    slotMappings: Array<{ slotId: string; label: string; index: number }>;
};
