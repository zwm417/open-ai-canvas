// @opc-feature: feature-credits [start]
import { http } from "@/services/api/request";
import type { CreditAccount } from "@/services/api/wallet";

export type FeatureCreditItem = {
    scene: string;
    enabled: boolean;
    mode: "fixed" | "model_price";
    fixedMicrocredits: number; // 1 credit = 1,000,000 microcredits
    defaultModel?: string;
};

export type FeatureCreditSettings = {
    features: Record<string, FeatureCreditItem>;
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
};

export const FEATURE_SCENE_DEFINITIONS: Array<{
    scene: string;
    title: string;
    description: string;
    category: "workbench" | "canvas";
    capability: "image" | "video" | "text";
}> = [
    {
        scene: "image_workbench",
        title: "生图工作台",
        description: "独立生图工作台的批次与单图生成",
        category: "workbench",
        capability: "image",
    },
    {
        scene: "video_workbench",
        title: "生视频工作台",
        description: "独立生视频工作台的分段生成与成片导出",
        category: "workbench",
        capability: "video",
    },
    {
        scene: "directing_assistant",
        title: "编导助手",
        description: "编导中枢多模态素材批次分析与原创短剧分镜脚本生成",
        category: "workbench",
        capability: "text",
    },
    {
        scene: "material_analysis",
        title: "素材分析",
        description: "画布节点：多模态图像/视频/音频特征拆解与核心洞察分析",
        category: "canvas",
        capability: "text",
    },
    {
        scene: "config_script",
        title: "配置生成脚本",
        description: "画布节点：按平台规格、风格与时长规则自动分段生成脚本",
        category: "canvas",
        capability: "text",
    },
    {
        scene: "video_reverse",
        title: "视频反推",
        description: "画布节点：逐秒密集抽帧与多模态反推镜头结构与提示词",
        category: "canvas",
        capability: "text",
    },
    {
        scene: "ref_script",
        title: "参考生脚本",
        description: "画布节点：结合参考反推与自定义配置生成时间线分镜脚本",
        category: "canvas",
        capability: "text",
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
