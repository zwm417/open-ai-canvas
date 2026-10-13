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
    // 1. 画布智能算子（4 个二开专用节点 + 3 个多维表格节点）
    {
        scene: "canvas_video_reverse",
        title: "画布节点 · 视频反推 (经典/创意)",
        description: "画布二开算子：视频逐秒抽帧、镜头拆解与提示词反推（支持经典反推与创意反推双模式）",
        category: "canvas",
        capability: "text",
        recommendedMultipliers: [1.0, 1.2, 1.5, 2.0],
    },
    {
        scene: "canvas_material_analysis",
        title: "画布节点 · 素材多模态分析",
        description: "画布二开算子：多模态图像/视频/音频特征拆解与核心洞察分析",
        category: "canvas",
        capability: "text",
        recommendedMultipliers: [1.0, 1.2, 1.5, 2.0],
    },
    {
        scene: "config_script",
        title: "画布节点 · 配置生成脚本",
        description: "画布二开算子：按平台规格、风格与时长规则自动分段生成脚本",
        category: "canvas",
        capability: "text",
        recommendedMultipliers: [1.0, 1.2, 1.5, 2.0],
    },
    {
        scene: "ref_script",
        title: "画布节点 · 参考生脚本",
        description: "画布二开算子：结合参考反推与自定义配置生成时间线分镜脚本",
        category: "canvas",
        capability: "text",
        recommendedMultipliers: [1.0, 1.2, 1.5, 2.0],
    },
    {
        scene: "voice_script_rewrite",
        title: "画布表格 · 台词配音多维表格",
        description: "画布多维表格：分镜原文台词口语化节奏改写与 ±2 字严格字数约束",
        category: "canvas_table",
        capability: "text",
        recommendedMultipliers: [1.0, 1.2, 1.5, 2.0],
    },
    {
        scene: "creative_storyboard_table",
        title: "画布表格 · 创意分镜多维表格",
        description: "画布多维表格：基于多镜头脚本与资产插槽的批量分镜推演生成",
        category: "canvas_table",
        capability: "text",
        recommendedMultipliers: [1.0, 1.2, 1.5, 2.0],
    },
    {
        scene: "creative_asset_table",
        title: "画布表格 · 创意资产多维表格",
        description: "画布多维表格：角色四视图/道具资产批量锚定与提示词生成",
        category: "canvas_table",
        capability: "text",
        recommendedMultipliers: [1.0, 1.2, 1.5, 2.0],
    },

    // 2. 生视频工作台 · 创作助手（功能入口）
    {
        scene: "assistant_material_analysis",
        title: "生视频工作台 · 创作助手 · 素材分析",
        description: "创作助手功能入口：多模态图像/视频/音频特征拆解与核心洞察分析",
        category: "creation_assistant",
        capability: "text",
        recommendedMultipliers: [1.0, 1.2, 1.5, 2.0],
    },
    {
        scene: "assistant_video_reverse",
        title: "生视频工作台 · 创作助手 · 视频反推 (经典/创意)",
        description: "创作助手功能入口：参考视频经典反推与创意反推抽帧拆解",
        category: "creation_assistant",
        capability: "text",
        recommendedMultipliers: [1.0, 1.2, 1.5, 2.0],
    },
    {
        scene: "directing_assistant",
        title: "生视频工作台 · 创作助手 · 生成脚本",
        description: "创作助手功能入口：结合素材洞察与参考反推生成全案短剧分镜脚本",
        category: "creation_assistant",
        capability: "text",
        recommendedMultipliers: [1.0, 1.2, 1.5, 2.0],
    },

    // 3. 生视频工作台 · 原生功能
    {
        scene: "video_director",
        title: "生视频工作台 · 编导分镜生成",
        description: "工作流卡片（口播/带货/到店/剧情等）内置编导助手时间线分镜与思考链生成",
        category: "video_workbench",
        capability: "text",
        recommendedMultipliers: [1.0, 1.2, 1.5, 2.0],
    },
    {
        scene: "video_replication",
        title: "生视频工作台 · 深度复刻推演",
        description: "参考视频端侧抽帧拼图与用户素材因果演进推演，生成 Seedance-2.0 专用提示词",
        category: "video_workbench",
        capability: "text",
        recommendedMultipliers: [1.0, 1.5, 2.0, 2.5],
    },
    {
        scene: "video_workbench",
        title: "生视频工作台 · 视频生成",
        description: "独立生视频工作台的分段生成与成片导出",
        category: "video_workbench",
        capability: "video",
    },

    // 4. 生图工作台
    {
        scene: "image_prompt_optimize",
        title: "生图工作台 · 技能提示词优化",
        description: "生图工作流技能卡片规范与素材插槽智能润色融合",
        category: "image_workbench",
        capability: "text",
        recommendedMultipliers: [1.0, 1.2, 1.5, 2.0],
    },
    // sub-feature: detail_set_workflow
    {
        scene: "detail_set_plan",
        title: "生图工作台 · 电商套图 AI 规划",
        description: "电商套图工作流卡片：商品图卖点分析与 12 模块逐行提示词规划（token 计量）",
        category: "image_workbench",
        capability: "text",
        recommendedMultipliers: [1.0, 1.2, 1.5, 2.0],
    },
    {
        scene: "image_workbench",
        title: "生图工作台 · 图像生成",
        description: "独立生图工作台的批次与单图渲染生成",
        category: "image_workbench",
        capability: "image",
    },
];

export function getSceneAliases(scene: string): string[] {
    const s = scene.trim();
    switch (s) {
        case "video_reverse":
            return ["canvas_video_reverse", "assistant_video_reverse", "video_reverse"];
        case "canvas_video_reverse":
            return ["canvas_video_reverse", "video_reverse", "assistant_video_reverse"];
        case "assistant_video_reverse":
            return ["assistant_video_reverse", "video_reverse", "canvas_video_reverse"];
        case "material_analysis":
            return ["canvas_material_analysis", "assistant_material_analysis", "material_analysis"];
        case "canvas_material_analysis":
            return ["canvas_material_analysis", "material_analysis", "assistant_material_analysis"];
        case "assistant_material_analysis":
            return ["assistant_material_analysis", "material_analysis", "canvas_material_analysis"];
        case "config_script":
        case "canvas_script_generator":
        case "canvas_config_script":
            return ["config_script", "canvas_script_generator", "canvas_config_script"];
        case "ref_script":
        case "canvas_reference_script":
        case "canvas_ref_script":
            return ["ref_script", "canvas_reference_script", "canvas_ref_script"];
        case "voice_script_rewrite":
        case "creative_voice_table":
        case "canvas_table_voice":
            return ["voice_script_rewrite", "creative_voice_table", "canvas_table_voice"];
        case "creative_storyboard_table":
        case "canvas_table_storyboard":
        case "storyboard_table":
            return ["creative_storyboard_table", "canvas_table_storyboard", "storyboard_table"];
        case "creative_asset_table":
        case "canvas_table_asset":
        case "asset_table":
            return ["creative_asset_table", "canvas_table_asset", "asset_table"];
        case "directing_assistant":
        case "assistant_generate_script":
        case "assistant_script":
            return ["directing_assistant", "assistant_generate_script", "assistant_script"];
        case "video_director":
        case "workflow_storyboard":
            return ["video_director", "workflow_storyboard"];
        case "video_replication":
        case "deep_replication":
            return ["video_replication", "deep_replication"];
        case "image_prompt_optimize":
        case "prompt_optimizer":
            return ["image_prompt_optimize", "prompt_optimizer"];
        default:
            return [s];
    }
}

export function resolveFeatureConfig(
    settings: FeatureCreditSettings | undefined,
    scene: string,
): FeatureCreditItem | undefined {
    if (!settings?.features) return undefined;
    const aliases = getSceneAliases(scene);
    for (const alias of aliases) {
        if (settings.features[alias]) {
            return settings.features[alias];
        }
    }
    const lower = scene.trim().toLowerCase();
    for (const [key, item] of Object.entries(settings.features)) {
        if (key.trim().toLowerCase() === lower) {
            return item;
        }
    }
    return undefined;
}

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
