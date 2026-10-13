// @opc-feature: detail_set_workflow [start]
// 电商套图规划器：阶段 1（一次 LLM 调用完成 vision 商品分析 + 逐行规划）
// 与阶段 2（本地逐行生图提示词组装，0 LLM）。
// 计费：走 requestImageQuestion 的 scene 通道（detail_set_plan，token_multiplier）。
// 零伪造铁律（AGENTS.md 12.1）：解析/校验失败如实抛错并保留原始错误摘要，绝不本地伪造规划结果。

import { requestImageQuestion } from "@/services/api/image";
import { resolveUpstreamImageReference } from "@/services/image-storage";
import {
    normalizeModelOptionValue,
    resolveModelForCapability,
    selectableModelsByCapability,
    type AiConfig,
} from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

import {
    DETAIL_SET_CATEGORIES,
    DETAIL_SET_LANGUAGE_LABEL,
    DETAIL_SET_MODULES,
    DETAIL_SET_RATIO_RESOLUTION,
    detailSetModuleShort,
    type DetailSetCategory,
    type DetailSetPlanSnapshot,
    type DetailSetProductAnalysis,
    type DetailSetRow,
} from "../types/detail-set";
import {
    DETAIL_SET_CATEGORY_PIPELINES,
    DETAIL_SET_ROW_TEMPLATES,
    getDetailSetTemplate,
} from "../catalog/detail-set-templates";
import { sanitizeDetailSetAdText } from "./detail-set-compliance";

/** 规划请求配置（从生图工作台 AiConfig 派生；图片语言/画幅/风格来自套图草稿） */
export type DetailSetPlanRequest = {
    config: AiConfig;
    selections: Record<string, number>;
    outputLanguage: string; // "none" 表示无文案
    aspectRatio: string;
    resolution: string;
    outputFormat: string;
    productSafe: boolean;
    stylePresetId: string | null;
    styleLook?: string;
    styleModuleHints?: Partial<Record<string, string>>;
    extraInstruction: string;
    productName?: string;
    category?: string;
    keySellingPoints?: string;
    productImages: ReferenceImage[]; // 商品槽位素材（vision 分析输入，最多 8 张）
    avoid?: string[];
    signal?: AbortSignal;
};

// 商业安全防御：核心规划器系统提示词已迁移至服务端金库，客户端仅保留宏标识
const SYSTEM_PROMPT = "__VAULT_PROMPT__:detail-set-planner";

/** 判定目标模型通道是否具备多模态视觉 (Vision / Multimodal) 能力 */
export function isVisionCapableModel(modelName?: string): boolean {
    if (!modelName) return false;
    const lower = modelName.toLowerCase();
    return (
        lower.includes("vision") ||
        lower.includes("vl") ||
        lower.includes("4o") ||
        lower.includes("gemini") ||
        lower.includes("claude-3") ||
        lower.includes("claude-sonnet") ||
        lower.includes("claude-opus") ||
        lower.includes("glm-4v") ||
        lower.includes("doubao-vision") ||
        lower.includes("qwen-vl") ||
        lower.includes("qvq") ||
        lower.includes("multimodal")
    );
}

/** 智能路由电商套图规划模型（优先调度多模态 Vision 模型，防止纯文本模型失明导致的假大空模板生成） */
export function resolveVisionPlannerModel(config: AiConfig): string {
    const safeChannels = Array.isArray(config?.channels) ? config.channels : [];
    const safeConfig = { ...config, channels: safeChannels };
    const availableTextModels = selectableModelsByCapability(safeConfig, "text");
    const extraModels = Array.isArray((config as any)?.availableModels) ? (config as any).availableModels : [];
    const candidatePool = [...availableTextModels, ...extraModels];

    // 1. 若当前配置的 textModel 已经具备 Vision 能力，优先复用
    const currentText = config.textModel ? normalizeModelOptionValue(config.textModel, safeChannels) : "";
    if (currentText && isVisionCapableModel(currentText) && candidatePool.includes(currentText)) {
        return currentText;
    }

    // 2. 若全局 model 具备 Vision 能力且在可用列表中，复用全局模型
    const currentGlobal = config.model ? normalizeModelOptionValue(config.model, safeChannels) : "";
    if (currentGlobal && isVisionCapableModel(currentGlobal) && candidatePool.includes(currentGlobal)) {
        return currentGlobal;
    }

    // 3. 从已启用的渠道模型列表中寻找首个具备 Vision 能力的模型
    const visionCandidate = candidatePool.find((m) => isVisionCapableModel(m));
    if (visionCandidate) {
        return visionCandidate;
    }

    // 4. 回退：常规文本模型路由
    return resolveModelForCapability(safeConfig, config.textModel, "text") || config.textModel || config.model || "";
}

export function buildDetailSetPlanMessages(request: DetailSetPlanRequest): {
    messages: Array<{ role: "system" | "user"; content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> }>;
} {
    const {
        selections,
        outputLanguage,
        aspectRatio,
        resolution,
        outputFormat,
        productSafe,
        stylePresetId,
        styleLook,
        styleModuleHints,
        extraInstruction,
        productName,
        category,
        keySellingPoints,
        productImages,
    } = request;

    const selectedModules = Object.entries(selections)
        .filter(([, count]) => count > 0)
        .map(([purpose, count]) => `${purpose}×${count}`);
    const totalCount = Object.values(selections).reduce((acc, n) => acc + (n > 0 ? n : 0), 0);
    const languageLabel = outputLanguage === "none" ? "无（画面不含任何文字元素）" : DETAIL_SET_LANGUAGE_LABEL[outputLanguage] ?? outputLanguage;
    const styleLine = stylePresetId ? `【套图风格】${styleLook ?? ""}${styleModuleHints && Object.keys(styleModuleHints).length ? `；模块要求：${Object.entries(styleModuleHints).map(([k, v]) => `${k}——${v}`).join("；")}` : ""}` : "";
    const avoidLine = request.avoid?.length ? `【规避瑕疵】${request.avoid.join("；")}` : "";

    const imageDescriptions = productImages
        .map((img, idx) => {
            const cleanName = (img.name || "").replace(/\.[^/.]+$/, "").trim();
            return cleanName ? `素材 ${idx + 1}：文件名/标签【${cleanName}】` : `素材 ${idx + 1}：商品实物图`;
        })
        .join("；");

    const categoryItem = DETAIL_SET_CATEGORIES.find((c) => c.id === category);
    const categoryDirective =
        category && category !== "auto"
            ? `【指定核心品类】${categoryItem?.name || category}（强制执行该品类专属刚性管线与光学特征，严禁漂移到美妆或其他无关品类）`
            : "【品类辨析要求】智能识别（请仔细分析实物图像，必须在 beauty|fashion|food|digital|home 中精准判定所属真实品类）";

    const userText = [
        `请基于上传的商品图与商品信息完成深入分析，并按所选模块规划一套共 ${totalCount} 张的电商详情套图。`,
        "【目标商品核心信息】",
        productName?.trim() ? `· 商品品名：${productName.trim()}` : "· 商品品名：（请基于上传实物图与素材标签智能辨析精准品名）",
        `· ${categoryDirective}`,
        keySellingPoints?.trim() ? `· 核心卖点与功能：${keySellingPoints.trim()}` : "",
        productImages.length > 0
            ? `【上传商品素材】已提供 ${productImages.length} 张实物素材（${imageDescriptions}）。请务必仔细辨识图中的真实商品外观、器型结构、材质面料与色彩细节。`
            : "",
        "【品类防漂移铁律】所有分镜的镜头标题、图内文案、视觉描述与生图提示词必须 100% 严格基于该【真实商品】展开！严禁无论上传什么商品都套用美妆护肤模板（如对鞋包衣服/数码3C误套用“紧致修护”、“水润质地”、“瓶身泵头”等风马牛不相及的文案）！",
        `【已选模块】${selectedModules.join("、")}（合计 ${totalCount} 张）`,
        `【图片语言】${languageLabel}`,
        `【画幅】${aspectRatio}（${DETAIL_SET_RATIO_RESOLUTION[aspectRatio] ?? resolution}）· 分辨率 ${resolution} · 格式 ${outputFormat}`,
        styleLine,
        `【商品一致性】${productSafe ? "开启：所有画面严格保持商品外观、包装、颜色、logo 与印刷文字完全不变，只重绘场景/背景/光线" : "关闭"}`,
        extraInstruction.trim() ? `【补充要求】${extraInstruction.trim()}` : "",
        avoidLine,
        "【提示词架构要求】每行 prompt 必须输出高质量中英双层架构：包括【画面主体与场景】中文指引、【图内排版文案】主副标题排版指引（若开启文案），以及【摄影图纸】纯正英文生图指令，严禁只输出纯英文！",
        "【输出红线】必须仅输出可直接被 JSON.parse 解析的纯 JSON 对象，格式包含 analysis 与 rows 数组，严禁包含任何前缀闲聊文字或后缀说明！",
    ]
        .filter(Boolean)
        .join("\n");

    const imageParts = productImages.slice(0, 8).map((image) => ({
        type: "image_url" as const,
        image_url: { url: image.dataUrl },
    }));

    return {
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: [{ type: "text", text: userText }, ...imageParts] },
        ],
    };
}

/** 请求模型完成规划（纯文本响应；由调用方统一处理积分与错误呈现） */
export async function requestDetailSetPlan(request: DetailSetPlanRequest): Promise<string> {
    const targetModel = resolveVisionPlannerModel(request.config);
    if (!targetModel) {
        throw new Error("未检测到可用的多模态视觉/文本模型通道，请在设置中配置或启用支持 Vision/对话的模型渠道");
    }
    const planConfig = {
        ...request.config,
        model: targetModel,
        textModel: targetModel,
    };
    const adaptedImages = await Promise.all(
        request.productImages.slice(0, 8).map(async (image) => {
            const resolvedUrl = await resolveUpstreamImageReference(image, planConfig, {
                label: `商品图（${image.name || "槽位素材"}）`,
            });
            return {
                ...image,
                dataUrl: resolvedUrl,
            };
        })
    );
    const { messages } = buildDetailSetPlanMessages({ ...request, productImages: adaptedImages });
    const raw = await requestImageQuestion(planConfig, messages, () => undefined, {
        signal: request.signal,
        scene: "detail_set_plan", // 计费场景：detail_set_plan（在 feature-credits 前后端目录注册）
        max_tokens: 8192,
        temperature: 0.7,
    });
    return raw;
}

/** 修复 JSON 字符串内部未转义的控制字符与换行符（防止模型返回多行描述时导致 JSON.parse 崩溃） */
function repairUnescapedNewlinesInJson(str: string): string {
    let inString = false;
    let escaped = false;
    let out = "";
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (escaped) {
            out += char;
            escaped = false;
            continue;
        }
        if (char === "\\") {
            escaped = true;
            out += char;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            out += char;
            continue;
        }
        if (inString && (char === "\n" || char === "\r")) {
            out += "\\n";
            continue;
        }
        out += char;
    }
    return out;
}

/** 剥离思考过程、markdown 围栏并提取 JSON 文本（工业级鲁棒性：支持未闭合思考标签、截断代码块与数组根） */
export function stripJsonFence(raw: string): string {
    if (!raw || typeof raw !== "string" || !raw.trim()) {
        throw new Error("大模型未返回任何规划内容，请检查大模型通道与 API Key 配置");
    }

    if (raw.trim() === "没有返回内容") {
        throw new Error("大模型通道返回为空（没有返回内容），请确认已选择具备 Vision 视觉与文本能力的大模型通道");
    }

    // 1. 过滤思考过程（支持闭合与未闭合的 <think> / <thought> 标签）
    let cleaned = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
        .trim();

    if (cleaned.includes("<think>")) {
        const lastThinkClose = cleaned.lastIndexOf("</think>");
        if (lastThinkClose >= 0) {
            cleaned = cleaned.slice(lastThinkClose + 8).trim();
        } else {
            // 没有闭合标签，在 <think> 后查找第一个 JSON 起始符
            const firstJsonChar = cleaned.search(/[{\[]/);
            if (firstJsonChar >= 0) {
                cleaned = cleaned.slice(firstJsonChar).trim();
            }
        }
    }

    // 2. 剥离 Markdown 代码块围栏（即使因 Token 上限未闭合也安全剥离）
    cleaned = cleaned.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

    // 3. 寻找最外层有效 JSON 起始符（支持对象 { 或数组 [）
    const firstBrace = cleaned.indexOf("{");
    const firstBracket = cleaned.indexOf("[");

    let isObject = true;
    let start = -1;
    if (firstBrace >= 0 && firstBracket >= 0) {
        if (firstBrace < firstBracket) {
            start = firstBrace;
            isObject = true;
        } else {
            start = firstBracket;
            isObject = false;
        }
    } else if (firstBrace >= 0) {
        start = firstBrace;
        isObject = true;
    } else if (firstBracket >= 0) {
        start = firstBracket;
        isObject = false;
    }

    if (start < 0) {
        const preview = raw.trim().slice(0, 100).replace(/\s+/g, " ");
        throw new Error(`模型输出中未找到 JSON 结构（原始输出：${preview}...），请重试或在设置中更换推理更稳定的模型通道`);
    }

    const closeChar = isObject ? "}" : "]";
    const end = cleaned.lastIndexOf(closeChar);
    // 若未找到闭合括号（Token 上限截断），保留从起始符开始的全部内容交由修复器补齐闭合
    let jsonStr = end > start ? cleaned.slice(start, end + 1) : cleaned.slice(start);

    // 4. 清理常见尾部多余逗号 (trailing commas)
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");

    return jsonStr;
}

/** 尝试宽松解析 JSON，并自动补全因 token 上限截断导致的未闭合引号与括号 */
export function tryParseJsonWithRepair(rawJsonStr: string): any {
    const jsonStr = repairUnescapedNewlinesInJson(rawJsonStr);
    try {
        return JSON.parse(jsonStr);
    } catch (primaryError) {
        // 尝试 0：如果是未闭合双引号截断（奇数个未转义双引号），先补全双引号
        const quoteMatches = jsonStr.match(/(?<!\\)"/g) || [];
        let baseCandidate = jsonStr;
        if (quoteMatches.length % 2 !== 0) {
            baseCandidate = jsonStr + '"';
        }

        // 尝试 1：如果末尾截断在某个属性或对象中，先尝试截断到最后一个 "}"
        const lastBraceIndex = baseCandidate.lastIndexOf("}");
        if (lastBraceIndex > 0) {
            let candidate = baseCandidate.slice(0, lastBraceIndex + 1);
            candidate = candidate.replace(/,\s*$/, "");
            const openBrackets = (candidate.match(/\[/g) || []).length;
            const closeBrackets = (candidate.match(/\]/g) || []).length;
            const openBraces = (candidate.match(/\{/g) || []).length;
            const closeBraces = (candidate.match(/\}/g) || []).length;

            for (let i = 0; i < openBrackets - closeBrackets; i++) candidate += "]";
            for (let i = 0; i < openBraces - closeBraces; i++) candidate += "}";

            try {
                return JSON.parse(candidate);
            } catch {
                // 忽略，进入下一步补全尝试
            }
        }

        // 尝试 2：直接在原字符串后补齐缺失的 "]" 与 "}"
        let directCandidate = baseCandidate.replace(/,\s*$/, "");
        const openBrackets = (directCandidate.match(/\[/g) || []).length;
        const closeBrackets = (directCandidate.match(/\]/g) || []).length;
        const openBraces = (directCandidate.match(/\{/g) || []).length;
        const closeBraces = (directCandidate.match(/\}/g) || []).length;

        for (let i = 0; i < openBrackets - closeBrackets; i++) directCandidate += "]";
        for (let i = 0; i < openBraces - closeBraces; i++) directCandidate += "}";

        try {
            return JSON.parse(directCandidate);
        } catch {
            throw primaryError;
        }
    }
}

function asStringArray(value: unknown, max: number): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, max);
}

/**
 * 自动对齐并自愈规划行数（正向商业健壮性保障）：
 * 1. 数量吻合：规范化 seq 并直接返回
 * 2. 数量超出：安全截取前 expectedTotal 项
 * 3. 数量不足（模型偶发漏项或极端 Token 截断）：按 selections 智能补齐所缺模块，杜绝硬抛错导致整批失败
 */
function autoReconcileRows(
    rows: DetailSetRow[],
    expectedSelections: Record<string, number>,
    expectedTotal: number,
    aspectRatio: string,
    outputLanguage: string,
    productName?: string,
    category?: string,
): DetailSetRow[] {
    if (expectedTotal <= 0) return rows;

    if (rows.length === expectedTotal) {
        return rows.map((r, i) => ({ ...r, seq: i + 1 }));
    }

    if (rows.length > expectedTotal) {
        return rows.slice(0, expectedTotal).map((r, i) => ({ ...r, seq: i + 1 }));
    }

    const result = [...rows];
    const countsInRows: Record<string, number> = {};
    for (const row of rows) {
        countsInRows[row.modulePurpose] = (countsInRows[row.modulePurpose] || 0) + 1;
    }

    const addText = outputLanguage !== "none";
    const prodPrefix = productName ? `${productName} · ` : "";

    for (const [purpose, expectedCount] of Object.entries(expectedSelections)) {
        if (expectedCount <= 0) continue;
        const currentCount = countsInRows[purpose] || 0;
        const missing = expectedCount - currentCount;
        for (let i = 0; i < missing && result.length < expectedTotal; i++) {
            const template = getDetailSetTemplate(purpose, category, i);
            const shortName = detailSetModuleShort(purpose);
            const visual = template?.visual ? `${prodPrefix}${template.visual}` : `商业摄影构图，真实还原${prodPrefix}${shortName}细节与场景质感`;
            const title = synthesizeDynamicShotTitle(productName || "", purpose, visual);
            const copy = addText ? synthesizeDynamicAdCopy({ productName: productName || "", purpose, category, seq: i + 1 }) : undefined;

            let prompt = template?.prompt ?? `Commercial studio product photography, ${purpose}, crisp focus, 8k resolution.`;
            if (!prompt.includes("【画面主体与场景】")) {
                const zhLines: string[] = [];
                zhLines.push(`【画面主体与场景】${visual}`);
                if (addText) {
                    const typo = formatTypographyLineFromCopy(copy);
                    if (typo) zhLines.push(typo);
                } else {
                    zhLines.push("【排版要求】纯净画面，不含任何文字与水印");
                }
                prompt = `${zhLines.join("\n")}\n\n【摄影图纸】${prompt}`;
            }

            result.push({
                seq: result.length + 1,
                modulePurpose: purpose,
                title,
                copy,
                visualDescription: visual,
                finalPrompt: prompt,
                aspectRatio,
                status: "planned",
            });
        }
    }

    while (result.length < expectedTotal) {
        const defaultTpl = getDetailSetTemplate("首图 / 主视觉", category, result.length);
        const visual = defaultTpl?.visual ? `${prodPrefix}${defaultTpl.visual}` : `${prodPrefix}商品高清全貌特写，通透干净纯色背景`;
        const title = synthesizeDynamicShotTitle(productName || "", "首图 / 主视觉", visual);
        const copy = addText ? synthesizeDynamicAdCopy({ productName: productName || "", purpose: "首图 / 主视觉", category, seq: result.length + 1 }) : undefined;
        let prompt = defaultTpl?.prompt ?? "Commercial studio hero packshot, pure white background #FFFFFF, crisp lighting, 85mm lens.";
        if (!prompt.includes("【画面主体与场景】")) {
            const zhLines: string[] = [];
            zhLines.push(`【画面主体与场景】${visual}`);
            if (addText) {
                const typo = formatTypographyLineFromCopy(copy);
                if (typo) zhLines.push(typo);
            } else {
                zhLines.push("【排版要求】纯净画面，不含任何文字与水印");
            }
            prompt = `${zhLines.join("\n")}\n\n【摄影图纸】${prompt}`;
        }
        result.push({
            seq: result.length + 1,
            modulePurpose: "首图 / 主视觉",
            title,
            copy,
            visualDescription: visual,
            finalPrompt: prompt,
            aspectRatio,
            status: "planned",
        });
    }

    return result.map((r, i) => ({ ...r, seq: i + 1 }));
}

/**
 * 从模型返回的 row 对象中提取模块类型（多态鲁棒支持）
 */
function extractRawPurpose(rawRow: Record<string, unknown>): string {
    const candidates = [
        rawRow.module,
        rawRow.module_purpose,
        rawRow.modulePurpose,
        rawRow.purpose,
        rawRow.moduleName,
        rawRow.module_name,
        rawRow.section,
        rawRow.section_name,
        rawRow.type,
        rawRow.shot_type,
        rawRow.shotType,
        rawRow.name,
    ];
    for (const val of candidates) {
        if (typeof val === "string" && val.trim().length > 0) {
            return val.trim();
        }
    }
    return "";
}

/**
 * 从模型返回的 row 对象中提取分镜标题/镜头说明（多态候选键 + 结构化对象提取）
 */
function extractRawTitle(rawRow: Record<string, unknown>): string {
    const candidates = [
        rawRow.shotTitle,
        rawRow.shot_title,
        rawRow.title,
        rawRow.shotName,
        rawRow.shot_name,
        rawRow.shot,
        rawRow.concept,
        rawRow.conceptName,
        rawRow.concept_name,
        rawRow.heading,
        rawRow.subheading,
        rawRow.module_title,
        rawRow.sceneTitle,
        rawRow.scene_title,
        rawRow.design_intent,
        rawRow.intent,
        rawRow.caption,
        rawRow.name,
    ];
    for (const val of candidates) {
        if (typeof val === "string" && val.trim().length > 0) {
            return val.trim();
        }
        if (typeof val === "object" && val !== null) {
            const obj = val as Record<string, unknown>;
            const text = obj.name || obj.title || obj.text || obj.desc;
            if (typeof text === "string" && text.trim().length > 0) {
                return text.trim();
            }
        }
    }
    return "";
}

/**
 * 从视觉描述或提示词中智能提炼镜头意图说明（自愈兜底，杜绝空白）
 */
export function deriveShotTitleFromVisual(visualDesc?: string, prompt?: string): string {
    const textToScan = visualDesc || prompt;
    if (!textToScan) return "";

    // 如果包含“【画面主体与场景】”，优先提取其核心主体与构图动作短语
    let coreVisual = textToScan;
    const match = textToScan.match(/【画面主体与场景】([^\n]+)/);
    if (match) {
        coreVisual = match[1].trim();
    }

    // 按标点切分短句，寻找最能代表机位、置景或动作意图的说明短语
    const parts = coreVisual.split(/[，,。；;\n]/).map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
        if (/特写|微距|悬浮|全景|全貌|俯视|平视|透视|爆炸|剖面|收纳|摆放|使用|实测|佩戴|上身|对比|光影|构图|置景/.test(part)) {
            const cleaned = part.replace(/^.*?·\s*/, "").trim();
            if (cleaned.length >= 2 && cleaned.length <= 16) {
                return cleaned;
            }
        }
    }
    if (parts.length > 0) {
        const first = parts[0].replace(/^.*?·\s*/, "").trim();
        if (first.length >= 2 && first.length <= 16) {
            return first;
        }
    }
    return "";
}

/**
 * 动态根据品名与模块叙事职责合成高信噪比镜头说明（动态自适应，杜绝硬编码固定模板）
 */
export function synthesizeDynamicShotTitle(
    productName: string,
    purpose: string,
    visualDesc?: string,
): string {
    const prod = productName?.trim() && productName !== "商品" && productName !== "品质商品" ? productName.trim() : "";
    const short = detailSetModuleShort(purpose);

    // 1. 若视觉描述中包含具体动作场景，优先提取动作关键词与品名结合
    if (visualDesc) {
        let action = "";
        if (/悬浮/.test(visualDesc)) action = "立体悬浮主图";
        else if (/微距|材质|纹理/.test(visualDesc)) action = "材质细节与工艺特写";
        else if (/水槽|厨房|浴室|台面|桌面|客厅|户外|卧室/.test(visualDesc)) {
            const env = visualDesc.match(/(水槽|厨房|浴室|台面|桌面|客厅|户外|卧室)/)?.[1] || "生活";
            action = `${env}实景使用场景`;
        } else if (/爆炸|解构|内部|结构/.test(visualDesc)) action = "精密内部结构拆解";
        else if (/对比|实测|前后/.test(visualDesc)) action = "使用前后效果对比实测";
        else if (/开箱|包装|全套|配件/.test(visualDesc)) action = "开箱清单与包装全貌";

        if (action) {
            return prod ? `${prod} · ${action}` : action;
        }
    }

    // 2. 结合品名与模块叙事职责动态装配，坚决杜绝死板固定字眼
    switch (purpose) {
        case "首图 / 主视觉":
            return prod ? `${prod}立体光影主视觉` : "商业光影主视觉全景";
        case "场景图 / 使用":
            return prod ? `${prod}真实生活使用场景` : "沉浸生活使用场景";
        case "卖点图 / 功效":
            return prod ? `${prod}核心功能与卖点解析` : "核心功能与功效解析";
        case "细节图 / 材质":
            return prod ? `${prod}工艺细节与材质微距` : "精工材质与工艺微距";
        case "包装图 / 到手":
            return prod ? `${prod}开箱清单与包装全览` : "真实开箱与包装全貌";
        case "收尾图 / CTA":
            return prod ? `${prod}高转化行动号召` : "临门转化与行动号召";
        case "成分图 / 配料":
            return prod ? `${prod}核心成分溯源解构` : "科学成分与原料溯源";
        case "结构图 / 功能":
            return prod ? `${prod}精密结构与功能解析` : "精密架构与内部解构";
        case "对比图 / 痛点":
            return prod ? `${prod}使用前后对比实测` : "痛点反差与效果实测";
        case "规格图 / 参数":
            return prod ? `${prod}官方规格与尺寸参数` : "官方规格与参数表";
        case "信任图 / 资质":
            return prod ? `${prod}品质认证与质检背书` : "权威质检与品质背书";
        case "送礼图 / 场景":
            return prod ? `${prod}礼赠开箱仪式感` : "礼赠开箱与尊贵仪式";
        default:
            return prod ? `${prod} · ${short}展示` : `${short}商业展示`;
    }
}

/**
 * 动态根据品名、核心卖点与模块叙事职责合成高转化合规图内排版文案（动态自适应自愈，杜绝空白与死板模板）
 */
export function synthesizeDynamicAdCopy(params: {
    productName: string;
    sellingPoints?: string[];
    purpose?: string;
    modulePurpose?: string;
    category?: string;
    seq?: number;
}): string {
    const { productName, sellingPoints = [], category = "home", seq = 1 } = params;
    const purpose = params.purpose || params.modulePurpose || "首图 / 主视觉";
    const prod = productName?.trim() && productName !== "商品" && productName !== "品质商品" && productName !== "电商套图" ? productName.trim() : "";
    const cleanSellingPoints = sellingPoints.map((sp) => sanitizeDetailSetAdText(sp.trim())).filter((sp) => sp.length >= 2);
    const sp1 = cleanSellingPoints[0] || "";
    const sp2 = cleanSellingPoints[1] || "";
    const sp3 = cleanSellingPoints[2] || "";

    let main = "";
    let sub = "";

    switch (purpose) {
        case "首图 / 主视觉":
            main = sp1 || "品质精选 · 匠心质造";
            sub = prod ? `${prod} · 质感新体验` : (sp2 || "简约美学 · 舒适生活");
            break;
        case "场景图 / 使用":
            main = "沉浸生活 · 随心畅享";
            sub = prod ? `${prod} · 融入居家多重场景` : (sp1 || "温馨空间 · 悦享日常");
            break;
        case "卖点图 / 功效":
            main = sp1 || "核心实力 · 强效出色";
            sub = sp2 || (prod ? `${prod} · 卓越性能保障` : "出色表现 · 实力见证");
            break;
        case "细节图 / 材质":
            main = "精工细作 · 触手可及";
            sub = sp3 || (sp2 ? `${sp2} · 微距质感可鉴` : (prod ? `${prod} · 考究选材耐磨耐用` : "严选材质 · 触感细腻"));
            break;
        case "包装图 / 到手":
            main = "品质全览 · 完好到手";
            sub = prod ? `${prod} · 精美礼盒原厂正品` : "严密包装 · 配件一应俱全";
            break;
        case "收尾图 / CTA":
            main = "品质之选 · 立即拥有";
            sub = prod ? `${prod} · 畅销好评不容错过` : "口碑推荐 · 开启品质生活";
            break;
        case "成分图 / 配料":
            main = "科学配比 · 纯净安心";
            sub = sp1 ? `${sp1} · 原料溯源品质保证` : (prod ? `${prod} · 科学萃取安全温和` : "严选成分 · 自然健康守护");
            break;
        case "结构图 / 功能":
            main = "精密架构 · 创新解构";
            sub = sp1 ? `${sp1} · 层层精工硬核护航` : (prod ? `${prod} · 人体工学舒适结构` : "结构创新 · 稳固耐用");
            break;
        case "对比图 / 痛点":
            main = "告别繁琐 · 效果立显";
            sub = sp1 ? `${sp1} · 实力见证不同凡响` : (prod ? `${prod} · 前后实测直观对比` : "实力革新 · 轻松省心体验");
            break;
        case "规格图 / 参数":
            main = "标准规格 · 一目了然";
            sub = prod ? `${prod} · 官方正品权威参数` : "详实参数 · 尺寸清晰规范";
            break;
        case "信任图 / 资质":
            main = "权威质检 · 品质保障";
            sub = prod ? `${prod} · 严格质检测试通过` : "安心严选 · 值得信赖之选";
            break;
        case "送礼图 / 场景":
            main = "心意甄选 · 礼遇尊贵";
            sub = prod ? `${prod} · 雅致礼赠传递温情` : "高端礼盒 · 传递满满真挚心意";
            break;
        default:
            main = sp1 || "品质严选 · 匠心质造";
            sub = prod ? `${prod} · 品质之选` : "细节考究 · 值得信赖";
            break;
    }

    const combined = `${main} · ${sub}`;
    return sanitizeDetailSetAdText(combined);
}

/**
 * 从生图提示词中智能反向提取图内排版营销文案（当模型在 JSON 顶层漏填 copy 时实现自愈）
 */
export function extractCopyFromPromptText(prompt: string): string | undefined {
    if (!prompt) return undefined;
    const match = prompt.match(/【(?:图内排版文案|图内排版|排版文案|排版要求|图内文案|海报文案|文字排版|文案)】[：:\s]*([^\n]+)/);
    if (!match) return undefined;
    let line = match[1].trim();
    if (!line || line.includes("不含任何文字") || line.includes("纯净画面") || line.includes("无乱码字符")) return undefined;

    // 清理可能包含的冒号或前置修饰词
    line = line.replace(/^[：:\s]+/, "");

    // 1. 尝试匹配“主标题：xxx，副标题/副文案：yyy”
    const mainMatch = line.match(/(?:主标题|主文案|主标|标题)[：:\s]*[“"']?([^”"'\n，,。；;]+)[”"']?/);
    const subMatch = line.match(/(?:副标题|副文案|副标题卖点|说明文案|副标)[：:\s]*[“"']?([^”"'\n，,。；;]+)[”"']?/);

    if (mainMatch && subMatch) {
        const main = mainMatch[1].trim();
        const sub = subMatch[1].trim();
        if (main && sub) return sanitizeDetailSetAdText(`${main} · ${sub}`);
        if (main) return sanitizeDetailSetAdText(main);
    }
    if (mainMatch) {
        return sanitizeDetailSetAdText(mainMatch[1].trim());
    }

    // 2. 尝试提取引号包裹的文案
    const quoteMatches = Array.from(line.matchAll(/[“"']([^”"']{2,30})[”"']/g)).map((m) => m[1].trim());
    if (quoteMatches.length >= 2) {
        return sanitizeDetailSetAdText(`${quoteMatches[0]} · ${quoteMatches[1]}`);
    } else if (quoteMatches.length === 1) {
        return sanitizeDetailSetAdText(quoteMatches[0]);
    }

    // 3. 兜底清洗：剥离尾部说明性版式词语
    const cleaned = line
        .replace(/，?(?:工整|高级|商业|硬核|东方雅致|专业)?(?:排版|版式)[^，\n]*/g, "")
        .replace(/，?预留(?:电商|专业)?留白[^，\n]*/g, "")
        .replace(/，?留白充足/g, "")
        .replace(/顶部留白居中排版[：:\s]*/g, "")
        .trim();
    if (cleaned.length >= 2 && cleaned.length <= 40) {
        return sanitizeDetailSetAdText(cleaned);
    }
    return undefined;
}

/**
 * 将真实的电商营销文案格式化为规范的【图内排版文案】指令行（坚决杜绝混入镜头说明 title）
 */
export function formatTypographyLineFromCopy(copy?: string): string {
    const trimmed = copy?.trim();
    if (!trimmed) {
        return "【图内排版文案】电商专业高转化排版，文字清晰工整，预留专业电商留白排版安全区";
    }
    // 如果已经显式包含“主标题”或“副标题/副文案”
    if (trimmed.includes("主标题") || trimmed.includes("副标题") || trimmed.includes("副文案")) {
        return `【图内排版文案】${trimmed}，工整商业排版，预留专业电商留白排版安全区`;
    }
    // 若包含分隔符（如 · 、 ， ），拆分为主标题与副文案
    if (trimmed.includes("·")) {
        const [main, ...subs] = trimmed.split("·");
        const sub = subs.join("·").trim();
        return `【图内排版文案】主标题：“${main.trim()}”${sub ? `，副文案：“${sub}”` : ""}，工整商业排版，预留专业电商留白排版安全区`;
    }
    if (trimmed.includes("，") || trimmed.includes(",")) {
        const [main, ...subs] = trimmed.split(/[，,]/);
        const sub = subs.join("，").trim();
        return `【图内排版文案】主标题：“${main.trim()}”${sub ? `，副文案：“${sub}”` : ""}，工整商业排版，预留专业电商留白排版安全区`;
    }
    return `【图内排版文案】主标题：“${trimmed}”，工整商业排版，预留专业电商留白排版安全区`;
}

/**
 * 同步更新提示词中的【图内排版文案】指令行，实现所见即所发
 */
export function updatePromptTypography(prompt: string, copy?: string, addText = true): string {
    if (!addText) {
        if (/【(?:图内排版文案|排版文案|排版要求)】[^\n]*/.test(prompt)) {
            return prompt.replace(/【(?:图内排版文案|排版文案|排版要求)】[^\n]*/, "【排版要求】纯净画面，不含任何文字、无乱码字符、无水印、无多余标签");
        }
        return `【排版要求】纯净画面，不含任何文字、无乱码字符、无水印、无多余标签\n\n${prompt}`;
    }
    const newLine = formatTypographyLineFromCopy(copy);
    if (/【(?:图内排版文案|排版文案|排版要求)】[^\n]*/.test(prompt)) {
        return prompt.replace(/【(?:图内排版文案|排版文案|排版要求)】[^\n]*/, newLine);
    }
    if (prompt.includes("【画面主体与场景】")) {
        return prompt.replace(/(【画面主体与场景】[^\n]*\n?)/, `$1${newLine}\n`);
    }
    return `${newLine}\n\n${prompt}`;
}

/**
 * 从模型返回的 row 对象中提取图内文案（多态支持字符串或结构化对象，并在对象层缺失时从提示词反向自愈提取）
 */
function extractRawCopy(rawRow: Record<string, unknown>, addText: boolean, rawPrompt?: string): string | undefined {
    if (!addText) return undefined;
    const candidates = [
        rawRow.copywriting,
        rawRow.copy,
        rawRow.ad_copy,
        rawRow.adCopy,
        rawRow.in_image_copy,
        rawRow.inImageCopy,
        rawRow.subTitle,
        rawRow.subtitle,
        rawRow.caption,
        rawRow.text,
        rawRow.slogan,
        rawRow.headline,
        rawRow.marketing_copy,
        rawRow.ad_text,
        rawRow.adText,
        rawRow.copy_text,
        rawRow.copyText,
        rawRow.words,
        rawRow.typography,
    ];
    let foundCopy: string | undefined;
    for (const val of candidates) {
        if (!val) continue;
        if (typeof val === "string" && val.trim().length > 0) {
            const sanitized = sanitizeDetailSetAdText(val.trim());
            if (sanitized && !/^(首图|主图|场景图|细节图|爆炸图|构图|特写|主视觉|展示)$/.test(sanitized)) {
                foundCopy = sanitized;
                break;
            }
        }
        if (typeof val === "object" && val !== null) {
            const obj = val as Record<string, unknown>;
            const main =
                typeof obj.mainTitle === "string" ? obj.mainTitle.trim()
                : typeof obj.main_title === "string" ? obj.main_title.trim()
                : typeof obj.title === "string" ? obj.title.trim()
                : typeof obj.headline === "string" ? obj.headline.trim()
                : typeof obj.main === "string" ? obj.main.trim()
                : typeof obj.text === "string" ? obj.text.trim()
                : "";
            const sub =
                typeof obj.subTitle === "string" ? obj.subTitle.trim()
                : typeof obj.sub_title === "string" ? obj.sub_title.trim()
                : typeof obj.subtitle === "string" ? obj.subtitle.trim()
                : typeof obj.sub_headline === "string" ? obj.sub_headline.trim()
                : typeof obj.subHeadline === "string" ? obj.subHeadline.trim()
                : typeof obj.body === "string" ? obj.body.trim()
                : typeof obj.desc === "string" ? obj.desc.trim()
                : typeof obj.sub === "string" ? obj.sub.trim()
                : typeof obj.slogan === "string" ? obj.slogan.trim()
                : "";
            if (main && sub) {
                foundCopy = sanitizeDetailSetAdText(`${main} · ${sub}`);
                break;
            }
            if (main) {
                foundCopy = sanitizeDetailSetAdText(main);
                break;
            }
            if (sub) {
                foundCopy = sanitizeDetailSetAdText(sub);
                break;
            }
        }
    }

    // 智能双向反向解析：如果对象层 copy 为空，或者 copy 错误等同于镜头说明，自动从 prompt 内部反向提取
    const promptToScan = rawPrompt || (typeof rawRow.prompt === "string" ? rawRow.prompt : undefined);
    if (promptToScan) {
        const promptCopy = extractCopyFromPromptText(promptToScan);
        if (promptCopy) {
            if (!foundCopy) {
                return promptCopy;
            }
            // 若提取出的 foundCopy 明显是镜头说明词（如包含“首图”、“主视觉”、“特写”、“构图”、“主图”）
            const isConceptTitle = /首图|主图|场景图|细节图|爆炸图|构图|特写|主视觉/.test(foundCopy);
            if (isConceptTitle && !/首图|主图|场景图|细节图|爆炸图|构图|特写|主视觉/.test(promptCopy)) {
                return promptCopy;
            }
        }
    }

    return foundCopy;
}

/**
 * 从模型返回的 row 对象中提取视觉描述 (Layer 1)
 */
function extractRawVisual(rawRow: Record<string, unknown>): string {
    const candidates = [
        rawRow.visual_description,
        rawRow.visualDescription,
        rawRow.visual,
        rawRow.description,
        rawRow.scene,
        rawRow.scene_description,
        rawRow.visual_prompt,
    ];
    for (const val of candidates) {
        if (typeof val === "string" && val.trim().length > 0) {
            return val.trim();
        }
    }
    return "";
}

/**
 * 从模型返回的 row 对象中提取生图提示词 (Layer 2)
 */
function extractRawPrompt(rawRow: Record<string, unknown>): string {
    const candidates = [
        rawRow.prompt,
        rawRow.finalPrompt,
        rawRow.final_prompt,
        rawRow.image_prompt,
        rawRow.generation_prompt,
    ];
    for (const val of candidates) {
        if (typeof val === "string" && val.trim().length > 0) {
            return val.trim();
        }
    }
    return "";
}

/**
 * 从模型返回的 row 对象中提取画幅比例
 */
function extractRawRatio(rawRow: Record<string, unknown>, fallbackRatio: string): string {
    const candidates = [rawRow.aspect_ratio, rawRow.aspectRatio, rawRow.ratio, rawRow.ar];
    for (const val of candidates) {
        if (typeof val === "string" && val.includes(":")) {
            return val.trim();
        }
    }
    return fallbackRatio;
}

/**
 * 结构化商品分析提取器：同时检索 root 与 analysis 层级
 */
function extractProductAnalysis(rawParsed: any): DetailSetProductAnalysis & { price?: string } {
    const root = (rawParsed && typeof rawParsed === "object" && !Array.isArray(rawParsed)) ? rawParsed : {};
    const analysis = (root.analysis && typeof root.analysis === "object" && !Array.isArray(root.analysis)) ? root.analysis : {};

    const productName =
        typeof analysis.productName === "string" && analysis.productName.trim() ? analysis.productName.trim()
        : typeof analysis.product_name === "string" && analysis.product_name.trim() ? analysis.product_name.trim()
        : typeof root.productName === "string" && root.productName.trim() ? root.productName.trim()
        : typeof root.product_name === "string" && root.product_name.trim() ? root.product_name.trim()
        : typeof analysis.name === "string" && analysis.name.trim() ? analysis.name.trim()
        : typeof root.name === "string" && root.name.trim() ? root.name.trim()
        : undefined;

    const category =
        typeof analysis.category === "string" && analysis.category.trim() ? analysis.category.trim()
        : typeof analysis.productCategory === "string" && analysis.productCategory.trim() ? analysis.productCategory.trim()
        : typeof analysis.product_category === "string" && analysis.product_category.trim() ? analysis.product_category.trim()
        : typeof root.productCategory === "string" && root.productCategory.trim() ? root.productCategory.trim()
        : typeof root.product_category === "string" && root.product_category.trim() ? root.product_category.trim()
        : typeof root.category === "string" && root.category.trim() ? root.category.trim()
        : undefined;

    const sellingPoints =
        asStringArray(analysis.sellingPoints, 4).length > 0 ? asStringArray(analysis.sellingPoints, 4)
        : asStringArray(analysis.selling_points, 4).length > 0 ? asStringArray(analysis.selling_points, 4)
        : asStringArray(root.sellingPoints, 4).length > 0 ? asStringArray(root.sellingPoints, 4)
        : asStringArray(root.selling_points, 4).length > 0 ? asStringArray(root.selling_points, 4)
        : [];

    const targetAudience =
        typeof analysis.targetAudience === "string" && analysis.targetAudience.trim() ? analysis.targetAudience.trim()
        : typeof analysis.target_audience === "string" && analysis.target_audience.trim() ? analysis.target_audience.trim()
        : typeof root.targetAudience === "string" && root.targetAudience.trim() ? root.targetAudience.trim()
        : typeof root.target_audience === "string" && root.target_audience.trim() ? root.target_audience.trim()
        : undefined;

    const usageScenarios =
        asStringArray(analysis.usageScenarios, 3).length > 0 ? asStringArray(analysis.usageScenarios, 3)
        : asStringArray(analysis.usage_scenarios, 3).length > 0 ? asStringArray(analysis.usage_scenarios, 3)
        : asStringArray(root.usageScenarios, 3).length > 0 ? asStringArray(root.usageScenarios, 3)
        : asStringArray(root.usage_scenarios, 3).length > 0 ? asStringArray(root.usage_scenarios, 3)
        : [];

    const painPoints =
        asStringArray(analysis.painPoints, 2).length > 0 ? asStringArray(analysis.painPoints, 2)
        : asStringArray(analysis.pain_points, 2).length > 0 ? asStringArray(analysis.pain_points, 2)
        : asStringArray(root.painPoints, 2).length > 0 ? asStringArray(root.painPoints, 2)
        : asStringArray(root.pain_points, 2).length > 0 ? asStringArray(root.pain_points, 2)
        : [];

    const price =
        typeof analysis.price === "string" && analysis.price.trim() ? analysis.price.trim()
        : typeof root.price === "string" && root.price.trim() ? root.price.trim()
        : undefined;

    return {
        productName,
        category,
        sellingPoints,
        targetAudience,
        usageScenarios,
        painPoints,
        price,
    };
}

/**
 * 品类自适应识别与归一化（工业级精准判定，彻底杜绝默认服饰污染）
 */
function resolveDetailSetCategory(
    expectedCategory?: string,
    rawExtractedCategory?: string,
    productName?: string,
    sellingPoints?: string[],
): string {
    // 1. 用户显式指定品类（非 auto）优先
    if (expectedCategory && expectedCategory !== "auto") {
        return expectedCategory;
    }

    // 2. 模型直接返回的品类标签
    const rawCat = (rawExtractedCategory || "").toLowerCase().trim();
    if (rawCat) {
        if (/beauty|美妆|护肤|个护|彩妆|洗发|沐浴|香水|口红|粉底/.test(rawCat)) return "beauty";
        if (/digital|数码|3c|电子|科技|外设|耳机|音箱|手机|电脑/.test(rawCat)) return "digital";
        if (/food|食品|生鲜|茶|饮|零食|饮料|粮油|坚果|烘焙/.test(rawCat)) return "food";
        if (/home|家居|日用|生活|家纺|厨具|收纳|家具|摆件|纸巾|杯|壶|盒/.test(rawCat)) return "home";
        if (/fashion|服饰|服装|鞋|包|穿搭|女装|男装|运动鞋|箱包/.test(rawCat)) return "fashion";
    }

    // 3. 上下文语义关键词推断
    const contextStr = `${productName || ""} ${(sellingPoints || []).join(" ")}`.toLowerCase();
    if (/耳机|手机|电脑|数码|充电|键盘|鼠标|手表|支架|镜头|音箱|机械|芯片|显卡|平板|数据线|智能|3c/.test(contextStr)) {
        return "digital";
    }
    if (/茶|果|食|肉|零食|饮|粮|米|面|奶|蜜|糕|酒|饼|干|汤|豆|生鲜|海鲜|糖|坚果|冲饮/.test(contextStr)) {
        return "food";
    }
    if (/床|被|枕|沙发|桌|椅|垫|灯|柜|收纳|厨|锅|杯|壶|帘|盒|巾|纸巾|餐具|洁具|晾晒|摆件|地毯|花瓶|家居|日用/.test(contextStr)) {
        return "home";
    }
    if (/精华|霜|水|乳|膏|膜|洗发|沐浴|香水|口红|粉底|眼影|防晒|洁面|卸妆|睫毛|精油|护肤/.test(contextStr)) {
        return "beauty";
    }
    if (/衣|裤|鞋|裙|衫|服|帽|袜|包|皮带|内衣|大衣|风衣|羽绒|卫衣|外套|西装|靴|跑鞋|运动鞋|帆布/.test(contextStr)) {
        return "fashion";
    }

    // 4. 正向工业兜底：日常商品默认 home，绝不回退为 fashion 产生服饰污染
    return "home";
}

/**
 * 模块名称正向自适应归一化：
 * 容错支持大模型输出的无空格格式（"首图/主视觉"）、短名（"首图"、"场景图"）、子项名（"主视觉"、"使用"）以及行业语义别名，
 * 映射回平台标准 DETAIL_SET_MODULES 的 canonical purpose。
 */
export function normalizeDetailSetPurpose(raw: string): string {
    const cleaned = String(raw || "").trim();
    if (!cleaned) return "";

    // 1. 完全精确匹配
    const exact = DETAIL_SET_MODULES.find((m) => m.purpose === cleaned);
    if (exact) return exact.purpose;

    // 2. 去除所有空白字符比对（处理 "首图/主视觉" vs "首图 / 主视觉"）
    const noSpace = cleaned.replace(/\s+/g, "");
    const matchedByNoSpace = DETAIL_SET_MODULES.find((m) => m.purpose.replace(/\s+/g, "") === noSpace);
    if (matchedByNoSpace) return matchedByNoSpace.purpose;

    // 3. 模块短名比对（处理 "首图"、"场景图"、"卖点图"）
    const matchedByShort = DETAIL_SET_MODULES.find((m) => m.short === cleaned || cleaned.startsWith(m.short) || m.short.startsWith(cleaned));
    if (matchedByShort) return matchedByShort.purpose;

    // 4. 斜杠后子项或分项比对（如 "主视觉"、"使用"、"功效"、"材质"）
    const matchedBySub = DETAIL_SET_MODULES.find((m) => {
        const parts = m.purpose.split("/").map((p) => p.trim());
        return parts.some((part) => part && (part === cleaned || cleaned.includes(part) || part.includes(cleaned)));
    });
    if (matchedBySub) return matchedBySub.purpose;

    // 5. 商业语义/行业常用别名正向映射
    const lower = cleaned.toLowerCase();
    if (/首图|主图|头图|主视觉|主视|封面|第一屏|hero|main/i.test(lower)) return "首图 / 主视觉";
    if (/场景|使用|佩戴|上身|摆放|生活|实境|代入|lifestyle|scene/i.test(lower)) return "场景图 / 使用";
    if (/卖点|功效|优势|功能|特性|亮点|核心|benefit|feature/i.test(lower)) return "卖点图 / 功效";
    if (/细节|材质|微距|做工|经纬|面料|特写|工艺|detail|macro|material/i.test(lower)) return "细节图 / 材质";
    if (/包装|开箱|到手|配件|全套|开盒|外盒|package|unboxing/i.test(lower)) return "包装图 / 到手";
    if (/收尾|行动|号召|下单|cta|购买|保障|closing/i.test(lower)) return "收尾图 / CTA";
    if (/成分|配料|原料|配方|萃取|formula|ingredient/i.test(lower)) return "成分图 / 配料";
    if (/结构|解构|剖面|爆炸|内部|架构|structure|exploded/i.test(lower)) return "结构图 / 功能";
    if (/对比|痛点|实测|前后|改善|反差|compare|versus|vs/i.test(lower)) return "对比图 / 痛点";
    if (/规格|参数|尺寸|容量|白皮书|表|spec|dimension/i.test(lower)) return "规格图 / 参数";
    if (/信任|资质|背书|检测|质检|认证|报告|证书|trust|certificate/i.test(lower)) return "信任图 / 资质";
    if (/送礼|礼盒|礼赠|仪式|节日|伴手礼|gift/i.test(lower)) return "送礼图 / 场景";

    return "";
}

/**
 * 解析并校验规划输出（手写校验，不引入新依赖）。
 * 校验失败抛出带真实原因的 Error，由调用方按 12.1 如实呈现。
 */
export function parseDetailSetPlanJson(
    raw: string,
    expected: {
        selections: Record<string, number>;
        aspectRatio: string;
        outputLanguage: string;
        planId: string;
        createdAt: number;
        stylePresetId?: string;
        extraInstruction: string;
        productSafe: boolean;
        resolution: string;
        outputFormat: string;
        productName?: string;
        category?: string;
        keySellingPoints?: string;
        productImages?: Array<{ name?: string }>;
    },
): DetailSetPlanSnapshot {
    let rawParsed: any;
    try {
        rawParsed = tryParseJsonWithRepair(stripJsonFence(raw));
    } catch (error) {
        throw new Error(`规划输出 JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
    }

    // 容错大模型直接输出 rows 数组的情况
    let parsed: {
        analysis?: DetailSetProductAnalysis;
        rows?: Array<Record<string, unknown>>;
    };
    if (Array.isArray(rawParsed)) {
        parsed = { rows: rawParsed };
    } else if (rawParsed && typeof rawParsed === "object") {
        parsed = rawParsed;
        // 如果 rows 键名被模型写成了 planRows / plan / items / shots
        if (!Array.isArray(parsed.rows)) {
            const alternativeRows = (parsed as any).planRows || (parsed as any).plan || (parsed as any).items || (parsed as any).shots;
            if (Array.isArray(alternativeRows)) {
                parsed.rows = alternativeRows;
            }
        }
    } else {
        throw new Error("规划输出缺少有效的 JSON 对象");
    }

    if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) {
        throw new Error("规划输出缺少 rows 数组");
    }

    const expectedTotal = Object.values(expected.selections).reduce((acc, n) => acc + (n > 0 ? n : 0), 0);
    const addText = expected.outputLanguage !== "none";

    const rawAnalysis = extractProductAnalysis(rawParsed);
    const inferredNameFromImage = expected.productImages?.[0]?.name
        ? expected.productImages[0].name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim()
        : "";

    // 商品品名自适应判定：若大模型提取出具有商业实质的真实品名，且非泛化占位符，优先采用模型识别
    const modelDetectedName =
        typeof rawAnalysis.productName === "string" &&
        rawAnalysis.productName.trim() &&
        rawAnalysis.productName.trim() !== "电商套图" &&
        rawAnalysis.productName.trim() !== "品质商品" &&
        rawAnalysis.productName.trim() !== "商品"
            ? rawAnalysis.productName.trim()
            : undefined;

    const resolvedProductName =
        expected.productName?.trim() ||
        modelDetectedName ||
        inferredNameFromImage ||
        "品质商品";

    const resolvedCategory = resolveDetailSetCategory(
        expected.category,
        rawAnalysis.category,
        resolvedProductName,
        rawAnalysis.sellingPoints,
    );

    // 构建预选模块目标队列（用于在模型自拟未知模块名时按序保真对齐，杜绝行丢弃）
    const targetPurposeQueue: string[] = [];
    for (const [modPurpose, count] of Object.entries(expected.selections)) {
        for (let c = 0; c < count; c++) {
            targetPurposeQueue.push(modPurpose);
        }
    }

    const rows: DetailSetRow[] = [];
    let seq = 0;
    for (let rowIndex = 0; rowIndex < parsed.rows.length; rowIndex++) {
        const rawRow = parsed.rows[rowIndex];
        if (!rawRow || typeof rawRow !== "object") continue;

        const rawPurpose = extractRawPurpose(rawRow);
        let purpose = normalizeDetailSetPurpose(rawPurpose);

        // 正向自愈：若模型返回了自拟模块名或纯数字序号，按用户勾选顺序依位置对齐，绝对禁止丢弃模型真实输出行！
        if (!purpose) {
            purpose = targetPurposeQueue[rowIndex] || targetPurposeQueue[targetPurposeQueue.length - 1] || "首图 / 主视觉";
        }

        seq += 1;
        const rawTitle = extractRawTitle(rawRow);
        const rawVisual = extractRawVisual(rawRow);
        const visualDescription = rawVisual ? rawVisual : undefined;

        let finalPrompt = extractRawPrompt(rawRow);
        if (!finalPrompt) {
            const fallbackTpl = getDetailSetTemplate(purpose, resolvedCategory, seq - 1);
            finalPrompt = fallbackTpl?.prompt || `${purpose} commercial product photography, 8k resolution, crisp studio lighting`;
        }

        const rawCopy = extractRawCopy(rawRow, addText, finalPrompt);

        // 镜头说明动态解析与自愈保障（正常进行说明，杜绝空白，杜绝硬编码固定模板）
        let resolvedTitle = rawTitle ? sanitizeDetailSetAdText(rawTitle) : "";
        if (!resolvedTitle || resolvedTitle === "展示" || resolvedTitle === "主图" || resolvedTitle === "商品" || resolvedTitle === "分镜") {
            const derived = deriveShotTitleFromVisual(visualDescription, finalPrompt);
            if (derived) {
                resolvedTitle = sanitizeDetailSetAdText(derived);
            }
        }
        if (!resolvedTitle) {
            resolvedTitle = synthesizeDynamicShotTitle(resolvedProductName, purpose, visualDescription);
        }

        const sanitizedTitle = resolvedTitle;
        let resolvedCopy = rawCopy ? sanitizeDetailSetAdText(rawCopy) : undefined;
        // 图内排版营销文案动态自愈保障：若开启文案模式且提取结果为空，正向自动触发动态高转化文案自愈装配（杜绝空白，杜绝死板模板）
        if (addText && (!resolvedCopy || resolvedCopy.trim().length < 2)) {
            resolvedCopy = synthesizeDynamicAdCopy({
                productName: resolvedProductName,
                sellingPoints: rawAnalysis.sellingPoints,
                purpose,
                category: resolvedCategory,
                seq,
            });
        }
        const sanitizedCopy = resolvedCopy;

        // 商业提示词中英双层架构保障：若模型未输出中文排版与主体指引层，正向自动补齐
        if (!finalPrompt.includes("【画面主体与场景】")) {
            const zhLines: string[] = [];
            const displayVisual = visualDescription || (sanitizedTitle ? `${sanitizedTitle}场景` : `${detailSetModuleShort(purpose)}商业摄影`);
            zhLines.push(`【画面主体与场景】${resolvedProductName ? `${resolvedProductName} · ` : ""}${displayVisual}`);
            if (addText) {
                const typo = formatTypographyLineFromCopy(sanitizedCopy);
                if (typo) zhLines.push(typo);
            } else {
                zhLines.push("【排版要求】纯净画面，不含任何文字、字符与水印");
            }
            finalPrompt = `${zhLines.join("\n")}\n\n【摄影图纸】${finalPrompt}`;
        } else {
            // 当 finalPrompt 已经包含【画面主体与场景】时，必须严格确保图内排版指令与 sanitizedCopy 保持绝对契约一致
            finalPrompt = updatePromptTypography(finalPrompt, sanitizedCopy, addText);
        }

        const rawRatio = extractRawRatio(rawRow, expected.aspectRatio);

        rows.push({
            seq,
            modulePurpose: purpose,
            title: sanitizedTitle,
            copy: sanitizedCopy,
            visualDescription,
            finalPrompt,
            aspectRatio: rawRatio,
            status: "planned",
        });
    }

    const reconciledRows = autoReconcileRows(
        rows,
        expected.selections,
        expectedTotal,
        expected.aspectRatio,
        expected.outputLanguage,
        resolvedProductName,
        resolvedCategory,
    );

    return {
        planId: expected.planId,
        createdAt: expected.createdAt,
        productName: resolvedProductName,
        category: resolvedCategory,
        price: typeof rawAnalysis.price === "string" && rawAnalysis.price.trim() ? rawAnalysis.price.trim() : "99.00",
        stylePresetId: expected.stylePresetId,
        extraInstruction: expected.extraInstruction,
        config: {
            addText,
            outputLanguage: expected.outputLanguage,
            aspectRatio: expected.aspectRatio,
            resolution: expected.resolution,
            outputFormat: expected.outputFormat,
            productSafe: expected.productSafe,
        },
        analysis: {
            productName: resolvedProductName,
            category: resolvedCategory,
            sellingPoints: asStringArray(rawAnalysis.sellingPoints, 4).length > 0 ? asStringArray(rawAnalysis.sellingPoints, 4) : expected.keySellingPoints ? expected.keySellingPoints.split(/[,，\s]+/).filter(Boolean).slice(0, 4) : [],
            targetAudience: typeof rawAnalysis.targetAudience === "string" ? rawAnalysis.targetAudience : undefined,
            usageScenarios: asStringArray(rawAnalysis.usageScenarios, 3),
            painPoints: asStringArray(rawAnalysis.painPoints, 2),
        },
        rows: reconciledRows,
    };
}

/**
 * 12 大电商核心模块镜头机位与视角标准化规范字典 (Standardized Module Camera Directives)
 * 严格杜绝全套电商图全为平视正面照（Flat front catalog packshot）的死板问题。
 * 为各模块赋予精准独特的摄影机位、焦段、景深与置景指令。
 */
export const DETAIL_SET_MODULE_CAMERA_DIRECTIVES: Record<string, { en: string; zh: string }> = {
    "首图 / 主视觉": {
        en: "Dynamic 3/4 three-quarter perspective angle, slightly low-angle heroic view, rotated product displaying dimensional depth and side contours, clean studio stage with subtle contact shadow",
        zh: "3/4立体黄金微侧动态视点，微仰角英雄视角，展现商品立体轮廓与侧身层次",
    },
    "场景图 / 使用": {
        en: "Eye-level authentic lifestyle immersion perspective, natural living environment with contextual surroundings, shallow depth of field f/2.0, atmospheric daylight illumination, realistic human interaction context",
        zh: "生活实境平视代入机位，真实生活环境置景，自然窗光漫射与浅景深虚化",
    },
    "卖点图 / 功效": {
        en: "Angled 45-degree dynamic product hero view, directional lighting accentuating key functional benefits, deliberate visual hierarchy reserving ample negative space for infographics",
        zh: "45度动态侧逆光机位，聚光凸显核心功能与质地，侧向留白信息区",
    },
    "细节图 / 材质": {
        en: "85mm extreme macro close-up view, 1:1 scale magnification, razor-sharp focus on texture grain, craftsmanship seams, and authentic material tactile details, soft atmospheric bokeh blur",
        zh: "85mm极限微距平视特写，1:1真实材质经纬纹理与精密工艺质感",
    },
    "包装图 / 到手": {
        en: "45-degree top-down flat-lay unboxing angle, open premium packaging box alongside main product and organized accessories, genuine customer delivery presentation",
        zh: "45度俯拍清单式开箱平铺，外包装礼盒与配件整洁平铺到手视点",
    },
    "收尾图 / CTA": {
        en: "Centered dramatic closing hero perspective, moody spotlight with gentle dark vignette, product anchored in lower third reserving clean upper negative space for call-to-action",
        zh: "沉浸式收口聚光视点，商品居中下沉，顶部纯净留白行动号召区",
    },
    "成分图 / 配料": {
        en: "Elevated high-angle botanical still life perspective, product surrounded by fresh raw ingredients, tactile textures, and crystal droplets under bright morning side light",
        zh: "高角度静物俯拍机位，商品与新鲜原料及自然晶莹水滴侧光环绕",
    },
    "结构图 / 功能": {
        en: "3D precision exploded axonometric perspective, multi-layer internal acoustic or engineering components floating along central axis, technical architectural diagram lighting",
        zh: "3D精密轴线爆炸剖面透视，核心零部件立体悬浮展开图纸视角",
    },
    "对比图 / 痛点": {
        en: "Split-screen dual comparison perspective, side-by-side comparative lighting contrasting dull problematic state against radiant optimal solution, centered product anchor",
        zh: "左右分屏对照机位，对比式明暗布光，直观呈现使用前后反差",
    },
    "规格图 / 参数": {
        en: "Clean orthographic flat elevation perspective, neutral high-key technical lighting, crisp outline contrast with spacious margin for dimension callouts",
        zh: "正平视工业级规格机位，纯净高调光影，预留严谨尺寸标注安全区",
    },
    "信任图 / 资质": {
        en: "Authoritative clinical lab podium perspective, pristine pedestal display, sharp scientific-grade rim lighting conveying official reliability and certitude",
        zh: "严谨质检验真展台机位，极简科技光环与官方权威品质背书",
    },
    "送礼图 / 场景": {
        en: "Warm ambient romantic holiday perspective, diagonal composition with satin ribbons, luxury gift presentation, warm glowing bokeh rim lighting",
        zh: "典雅礼赠暖光氛围机位，斜角构图与丝带礼盒尊贵仪式感置景",
    },
};

/**
 * 阶段 2：逐行生图提示词本地极简高信噪比编译（0 LLM）。
 * 架构：Layer 1 中文商业视觉与排版指令 + Layer 2 工业摄影图纸 + 模块专属机位(Camera Directive) + 视觉风格(Style Look) + 锁品一致性锚点(Product Safe) + 画幅参数(--ar)
 * 商业规范红线：严禁向正向提示词中注入大量中文规避词/否定句（如“杜绝塑料感”），避免反向注意力污染。
 */
export function buildRowFinalPrompt(params: {
    row: DetailSetRow;
    plan: Pick<DetailSetPlanSnapshot, "config" | "extraInstruction"> & {
        analysis?: DetailSetProductAnalysis;
        productName?: string;
        category?: string;
    };
    styleLook?: string;
    avoid?: string[];
}): string {
    const { row, plan, styleLook } = params;
    const basePrompt = row.finalPrompt?.trim() || "";
    const productName = plan.productName || plan.analysis?.productName || "商品";
    const shortPurpose = detailSetModuleShort(row.modulePurpose);

    const parts: string[] = [];

    // 1. 中文商业视觉与排版指令（Layer 1）
    const hasChineseVisual = basePrompt.includes("【画面主体与场景】");
    const hasChineseTypography = basePrompt.includes("【图内排版文案】") || basePrompt.includes("【排版要求】");

    let activePrompt = basePrompt;
    // 商业“所见即所发”铁律：
    // 若用户已在微调弹窗中显式编辑过 finalPrompt (row.isEdited === true)，则 100% 保持用户编辑内容，绝不在后台用正则抹平或覆盖！
    if (!row.isEdited) {
        if (hasChineseTypography) {
            if (plan.config.addText) {
                if (row.copy) {
                    const updatedLine = formatTypographyLineFromCopy(row.copy);
                    activePrompt = activePrompt.replace(/【(?:图内排版文案|排版文案|排版要求)】[^\n]*/, updatedLine);
                }
            } else {
                activePrompt = activePrompt.replace(/【(?:图内排版文案|排版文案|排版要求)】[^\n]*/, "【排版要求】纯净画面，不含任何文字、无乱码字符、无水印、无多余标签");
            }
        }
    }

    // 若 basePrompt 缺少中文层，正向自动补齐
    if (!hasChineseVisual) {
        const visualDesc = row.visualDescription?.trim() || `${productName} · ${row.title || shortPurpose}商业摄影构图，专业影棚布光，真实材质细节与物理阴影`;
        parts.push(`【画面主体与场景】${visualDesc.startsWith(productName) ? visualDesc : `${productName} · ${visualDesc}`}`);
    }

    if (!hasChineseTypography) {
        if (plan.config.addText) {
            const typo = formatTypographyLineFromCopy(row.copy);
            if (typo) parts.push(typo);
        } else {
            parts.push("【排版要求】纯净画面，不含任何文字、无乱码字符、无水印、无多余标签");
        }
    }

    // 2. 核心工业摄影图纸（Layer 2 提示词）
    if (activePrompt) {
        parts.push(activePrompt);
    }

    // 2.1 模块专属机位与视角标准化编译（Camera Perspective & Framing）
    const cameraDirective = DETAIL_SET_MODULE_CAMERA_DIRECTIVES[row.modulePurpose];
    if (cameraDirective) {
        const lowerPrompt = activePrompt.toLowerCase();
        const hasCameraAngle = lowerPrompt.includes("perspective") || lowerPrompt.includes("angle") || lowerPrompt.includes("view") || lowerPrompt.includes("macro") || lowerPrompt.includes("flat-lay") || lowerPrompt.includes("exploded");
        if (!hasCameraAngle) {
            parts.push(`Camera perspective and framing: ${cameraDirective.en}.`);
        }
    }

    // 3. 品类级动态光学特化（若 prompt 尚未包含，则按 category 补充纯净英文特化）
    const category = plan.category || plan.analysis?.category;
    if (category && DETAIL_SET_CATEGORY_PIPELINES[category]) {
        const catSpec = DETAIL_SET_CATEGORY_PIPELINES[category];
        const lowerBase = activePrompt.toLowerCase();
        const hasOptics = catSpec.compositionKeywords.some((kw) => lowerBase.includes(kw.toLowerCase()));
        if (!hasOptics && catSpec.englishOptics) {
            parts.push(catSpec.englishOptics);
        }
    }

    // 4. 全局视觉风格特征（如存在且未包含于基础提示词中）
    if (styleLook && styleLook.trim()) {
        const trimmedLook = styleLook.trim();
        if (!activePrompt.includes(trimmedLook)) {
            parts.push(`Style and aesthetic: ${trimmedLook}.`);
        }
    }

    // 5. 锁品物理一致性刚性锚点与多视角重绘指令
    if (plan.config.productSafe) {
        const productSafeAnchor = "Preserve exact product packaging, brand logo, label typography, and physical structural form factor without alteration.";
        const multiAngleDirective = "Multi-angle dynamic re-rendering directive: Seamlessly re-compose, rotate, and stage the product from the designated camera perspective, scene environment, and angle specified above; strictly avoid repeating duplicate flat front catalog views.";
        if (!activePrompt.toLowerCase().includes("preserve exact product")) {
            parts.push(`${multiAngleDirective} ${productSafeAnchor}`);
        } else if (!activePrompt.toLowerCase().includes("multi-angle dynamic")) {
            parts.push(multiAngleDirective);
        }
    }

    // 6. 补充说明要求（若有且简短）
    if (plan.extraInstruction && plan.extraInstruction.trim()) {
        const extra = plan.extraInstruction.trim();
        if (!activePrompt.includes(extra)) {
            parts.push(`Client directive: ${extra}.`);
        }
    }

    // 7. 画幅比例参数（Midjourney / Flux / SD 统一 --ar 标记）
    if (row.aspectRatio && !activePrompt.includes("--ar ")) {
        parts.push(`--ar ${row.aspectRatio}`);
    }

    return parts.join("\n\n");
}

/** 阶段 1 彻底不可用时的降级路径：按 few-shot 模板直出行（如实标注为模板规划，非 AI 规划） */
export function buildFallbackPlanRows(
    selections: Record<string, number>,
    aspectRatio: string,
    addText: boolean,
    productName?: string,
    category?: string,
): DetailSetRow[] {
    const rows: DetailSetRow[] = [];
    const prod = productName || "商品";
    let seq = 0;
    for (const mod of DETAIL_SET_MODULES) {
        const count = selections[mod.purpose] ?? 0;
        if (count <= 0) continue;
        for (let i = 0; i < count; i += 1) {
            const template = getDetailSetTemplate(mod.purpose, category, i);
            seq += 1;
            const shortName = mod.short;
            const visual = template?.visual ? `${prod} · ${template.visual}` : `商业摄影构图，真实展现${prod}${shortName}细节与场景质感`;
            const title = synthesizeDynamicShotTitle(prod, mod.purpose, visual);
            const copy = addText ? synthesizeDynamicAdCopy({ productName: prod, purpose: mod.purpose, category, seq }) : undefined;
            let prompt = template?.prompt ?? `Commercial studio product photography, ${mod.purpose}, crisp focus, 85mm lens.`;
            if (!prompt.includes("【画面主体与场景】")) {
                const zhLines: string[] = [];
                zhLines.push(`【画面主体与场景】${visual}`);
                if (addText) {
                    const typo = formatTypographyLineFromCopy(copy);
                    if (typo) zhLines.push(typo);
                } else {
                    zhLines.push("【排版要求】纯净画面，不含任何文字与水印");
                }
                prompt = `${zhLines.join("\n")}\n\n【摄影图纸】${prompt}`;
            }
            rows.push({
                seq,
                modulePurpose: mod.purpose,
                title,
                copy,
                visualDescription: visual,
                finalPrompt: prompt,
                aspectRatio,
                status: "planned",
            });
        }
    }
    return rows;
}
// @opc-feature: detail_set_workflow [end]
