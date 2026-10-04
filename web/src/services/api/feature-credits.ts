// @opc-feature: feature-credits [start]
import { http } from "@/services/api/request";
import type { CreditAccount } from "@/services/api/wallet";

export type FeatureCreditItem = {
    scene: string;
    enabled: boolean;
    mode: "fixed" | "model_price" | "token_multiplier";
    fixedMicrocredits: number; // 1 credit = 1,000,000 microcredits
    multiplierBasisPoints?: number; // 场景基准倍率 (10,000 = 1.0x)
    defaultModel?: string;
};

export type FeatureSceneMeta = {
    scene: string;
    title: string;
    description: string;
    category: string;
    capability: "image" | "video" | "text";
    recommendedMultipliers?: number[];
};

export type FeatureCreditSettings = {
    features: Record<string, FeatureCreditItem>;
    modelSceneMultipliers?: Record<string, Record<string, number>>; // modelKey -> scene -> BPS
    sceneCatalog?: FeatureSceneMeta[];
};

export type DeductFeatureCreditsParams = {
    scene: string;
    model?: string;
    amountMicrocredits?: number;
    note?: string;
    referenceKey?: string;
};

export type DeductFeatureCreditsResult = {
    account?: CreditAccount;
    deductedMicrocredits: number;
    charged: boolean;
};

export type RefundFeatureCreditsParams = {
    amountMicrocredits: number;
    scene: string;
    model?: string;
    note?: string;
    referenceKey?: string;
    originalReferenceKey?: string;
    originalDeductionId?: string;
};

export const FEATURE_SCENE_DEFINITIONS: FeatureSceneMeta[] = [
    {
        scene: "video_director",
        title: "生视频工作台 · 编导分镜生成",
        description: "工作流卡片（口播/带货/到店/剧情等）内置编导助手时间线分镜与思考链生成",
        category: "video_workbench",
        capability: "text",
    },
    {
        scene: "video_replication",
        title: "生视频工作台 · 深度复刻推演",
        description: "参考视频端侧抽帧拼图与用户素材因果演进推演，生成 Seedance-2.0 专用提示词",
        category: "video_workbench",
        capability: "text",
    },
    {
        scene: "directing_assistant",
        title: "创造助手 · 全案原创分镜脚本",
        description: "编导中枢多模态素材批次分析与原创短剧分镜脚本生成",
        category: "creation_assistant",
        capability: "text",
    },
    {
        scene: "material_analysis",
        title: "创造助手 · 素材多模态洞察分析",
        description: "多模态图像/视频/音频特征拆解与核心洞察分析",
        category: "creation_assistant",
        capability: "text",
    },
    {
        scene: "video_reverse",
        title: "参考视频抽帧反推算子",
        description: "逐秒密集抽帧与多模态反推镜头结构与提示词",
        category: "creation_assistant",
        capability: "text",
    },
    {
        scene: "image_prompt_optimize",
        title: "生图工作台 · 技能提示词优化",
        description: "生图工作流技能卡片规范与素材插槽智能润色融合",
        category: "image_workbench",
        capability: "text",
    },
    {
        scene: "voice_script_rewrite",
        title: "台词配音表 · 分镜台词口语化改写",
        description: "分镜原文台词口语化节奏改写与 ±2 字严格字数约束",
        category: "voice",
        capability: "text",
    },
    {
        scene: "config_script",
        title: "画布节点 · 配置生成脚本",
        description: "按平台规格、风格与时长规则自动分段生成脚本",
        category: "canvas",
        capability: "text",
    },
    {
        scene: "ref_script",
        title: "画布节点 · 参考生脚本",
        description: "结合参考反推与自定义配置生成时间线分镜脚本",
        category: "canvas",
        capability: "text",
    },
    {
        scene: "image_workbench",
        title: "生图工作台 · 图像生成",
        description: "独立生图工作台的批次与单图渲染生成",
        category: "image_workbench",
        capability: "image",
    },
    {
        scene: "video_workbench",
        title: "生视频工作台 · 视频生成",
        description: "独立生视频工作台的分段生成与成片导出",
        category: "video_workbench",
        capability: "video",
    },
];

export async function getPublicFeatureCredits(): Promise<FeatureCreditSettings> {
    const res = await http.get<{ settings: FeatureCreditSettings }>("/public/feature-credits");
    return res.settings;
}

export async function getAdminFeatureCredits(): Promise<FeatureCreditSettings> {
    const res = await http.get<{ settings: FeatureCreditSettings }>("/admin/settings/feature-credits");
    return res.settings;
}

export async function updateAdminFeatureCredits(settings: FeatureCreditSettings): Promise<FeatureCreditSettings> {
    const res = await http.patch<{ settings: FeatureCreditSettings }>("/admin/settings/feature-credits", settings);
    return res.settings;
}

export async function deductFeatureCredits(params: DeductFeatureCreditsParams): Promise<DeductFeatureCreditsResult> {
    const res = await http.post<DeductFeatureCreditsResult>("/feature-credits/deduct", params);
    if (res.charged) {
        window.dispatchEvent(new CustomEvent("wallet:updated"));
    }
    return res;
}

export async function refundFeatureCredits(params: RefundFeatureCreditsParams): Promise<CreditAccount | null> {
    if (!params.amountMicrocredits || params.amountMicrocredits <= 0) {
        return null;
    }
    const res = await http.post<{ account: CreditAccount }>("/feature-credits/refund", params);
    window.dispatchEvent(new CustomEvent("wallet:updated"));
    return res.account;
}
// @opc-feature: feature-credits [end]
