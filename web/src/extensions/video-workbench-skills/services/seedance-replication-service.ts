// @opc-feature: seedance-replication-service [start]
import { imageToDataUrl } from "@/services/image-storage";
import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";
import { resolveModelForCapability, type AiConfig } from "@/stores/use-config-store";
import { resolveChannelVideoModelMaxDuration } from "@/lib/model-capabilities";
import { HEADER_CANVAS_SYSTEM_PROMPT_ID, VAULT_PROMPT_IDS } from "@/services/api/prompt-vault";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { prepareReverseVideo, disposePreparedReverseVideo } from "@/extensions/opc-infinite/services/video-reverse-analysis";

export interface SeedanceReplicationRequest {
    videoSource: Blob | File | string;
    productImages: ReferenceImage[];
    modelImages: ReferenceImage[];
    sceneImages: ReferenceImage[];
    audioFiles?: ReferenceAudio[];
    supplementaryNotes?: string;
    effectiveConfig: AiConfig;
    targetModel?: string;
    onProgress?: (progress: { stage: string; percent: number; message: string }) => void;
    onDelta?: (chunk: string) => void;
    signal?: AbortSignal;
}

export interface SeedanceReplicationAssetMapping {
    label: string; // e.g. "@图片1（商品）"
    role: "product" | "model" | "scene";
    name: string;
    image: ReferenceImage;
}

export interface SeedanceReplicationResult {
    prompt: string;
    thinking?: string;
    recommendedDurationSec: number;
    assetMappings: SeedanceReplicationAssetMapping[];
    orderedImages: ReferenceImage[];
    audioFiles: ReferenceAudio[];
}

// 商业安全防御：Seedance 复刻系统提示词已迁入服务端金库，客户端仅保留宏标识
const SYSTEM_PROMPT = "__VAULT_PROMPT__:seedance-replication";

export async function executeSeedanceReplicationAnalysis(
    request: SeedanceReplicationRequest,
): Promise<SeedanceReplicationResult> {
    const {
        videoSource,
        productImages,
        modelImages,
        sceneImages,
        audioFiles = [],
        supplementaryNotes = "",
        effectiveConfig,
        targetModel,
        onProgress,
        onDelta,
        signal,
    } = request;

    // 1. 本地硬件极速抽帧与接触拼图生成 (复用轻量端侧解构)
    onProgress?.({
        stage: "extract",
        percent: 10,
        message: "正在使用端侧算力提取视频时序关键帧与音轨...",
    });

    const prepared = await prepareReverseVideo(
        videoSource,
        9,
        (p) => {
            onProgress?.({
                stage: p.stage,
                percent: Math.min(50, Math.round(10 + (p.percent / 100) * 40)),
                message: p.message,
            });
        },
        { signal },
    );

    try {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

        onProgress?.({
            stage: "assemble",
            percent: 55,
            message: "正在编排多模态素材指针与时空对齐矩阵...",
        });

        // 2. 组装输入资产映射表与图片列表
        // 规则：按 Seedance 原生 @图片1, @图片2... 顺序连续编排
        const assetMappings: SeedanceReplicationAssetMapping[] = [];
        const orderedImages: ReferenceImage[] = [];
        let imageCounter = 1;

        // 商品类
        productImages.forEach((img, idx) => {
            const label = `@图片${imageCounter}（商品${productImages.length > 1 ? idx + 1 : ""}）`;
            assetMappings.push({ label, role: "product", name: img.name || `商品图${idx + 1}`, image: img });
            orderedImages.push(img);
            imageCounter += 1;
        });

        // 人物类
        modelImages.forEach((img, idx) => {
            const label = `@图片${imageCounter}（人物${modelImages.length > 1 ? idx + 1 : ""}）`;
            assetMappings.push({ label, role: "model", name: img.name || `人物图${idx + 1}`, image: img });
            orderedImages.push(img);
            imageCounter += 1;
        });

        // 场景背景类
        sceneImages.forEach((img, idx) => {
            const label = `@图片${imageCounter}（背景${sceneImages.length > 1 ? idx + 1 : ""}）`;
            assetMappings.push({ label, role: "scene", name: img.name || `背景图${idx + 1}`, image: img });
            orderedImages.push(img);
            imageCounter += 1;
        });

        // 3. 构建用户提示词正文
        const assetDescriptions: string[] = [];
        assetDescriptions.push(`- @视频1：参考视频的时序抽帧拼图，全长约 ${Math.round(prepared.durationSec)} 秒，呈现原片的镜头运镜调度、主体动作与道具交互节奏。`);
        
        assetMappings.forEach((mapping) => {
            assetDescriptions.push(`- ${mapping.label}：用户上传的${mapping.role === "product" ? "商品" : mapping.role === "model" ? "人物角色" : "场景背景"}素材（${mapping.name}）。`);
        });

        if (audioFiles.length > 0) {
            audioFiles.forEach((aud, idx) => {
                assetDescriptions.push(`- @音频${idx + 1}：用户上传的参考音频（${aud.name || "配音/音效"}）。`);
            });
        }

        const inputMappingRule = `【多模态图片输入与指针对应协议】：
- 输入图片列表中的第 1 张图为：@视频1（原片时序抽帧拼图，全景展示原片关键帧序列）；
${assetMappings.length > 0 ? `- 输入图片列表中的第 2 张及后续图片依次对应：${assetMappings.map((m, i) => `第 ${i + 2} 张图对应 ${m.label}`).join("；")}。` : "- 用户本次未上传额外素材图，请仅基于@视频1抽帧拼图推演并按补充说明生成提示词。"}
必须严格遵循上述编号绑定，严禁混淆原片拼图与替换素材图。`;

        const targetModelContext = targetModel ? `【目标视频生成模型】：${targetModel}（必须严格适配其 DiT 扩散架构的因果与注意力机制）\n\n` : "";

        const userTextPrompt = `${targetModelContext}【输入素材清单】：
${assetDescriptions.join("\n")}

${inputMappingRule}

【用户补充说明与定制指令】：
${supplementaryNotes.trim() ? supplementaryNotes.trim() : "无特殊补充，请严格根据上述素材推演连锁同步变化，生成符合 Seedance-2.0 标准的高保真复刻提示词。"}

请根据系统指示与 Seedance-2.0 运行机制，直接生成高密度、纯正物理因果的三段式复刻提示词正文。`;

        // 4. 获取拼图 DataURL 与 用户素材 DataURL
        const contactSheetDataUrl = prepared.pages[0]?.url;
        if (!contactSheetDataUrl) {
            throw new Error("无法生成视频抽帧拼图，请检查视频是否可用");
        }

        // 组装多模态消息：首图为参考视频拼图，后随用户各素材图
        const userContentParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
            { type: "text", text: userTextPrompt },
            { type: "image_url", image_url: { url: contactSheetDataUrl } },
        ];

        for (const item of orderedImages) {
            const dataUrl = await imageToDataUrl(item);
            userContentParts.push({
                type: "image_url",
                image_url: { url: dataUrl },
            });
        }

        // 5. 采用金库宏占位符（服务端统一零泄露注入）
        const systemPrompt = SYSTEM_PROMPT;

        onProgress?.({
            stage: "reasoning",
            percent: 65,
            message: "多模态大模型正在深度解析动作因果链与连锁同步演进...",
        });

        const messages: AiTextMessage[] = [
            {
                role: "user",
                content: userContentParts,
            },
        ];

        // 6. 调用多模态大模型生成提示词
        // 核心治理：优先解析具备视觉图文多模态能力的推理大模型，避免误将 DiT 视频生成模型 (targetModel) 作为 Chat LLM 触发协议报错
        const analysisModel =
            resolveModelForCapability(effectiveConfig, undefined, "image") ||
            effectiveConfig.imageModel ||
            effectiveConfig.model ||
            effectiveConfig.textModel;

        let accumulated = "";
        const rawResponse = await requestImageQuestion(
            {
                ...effectiveConfig,
                model: analysisModel,
                systemPrompt,
            },
            messages,
            (chunk: string) => {
                accumulated += chunk;
                onDelta?.(chunk);
            },
            {
                signal,
                scene: "video_replication",
                headers: {
                    [HEADER_CANVAS_SYSTEM_PROMPT_ID]: VAULT_PROMPT_IDS.SEEDANCE_REPLICATION,
                },
            },
        );

        const finalText = rawResponse || accumulated;

        // 7. 解析思考链与清洗纯文本
        let thinking: string | undefined;
        let cleanPrompt = finalText;

        const thinkStart = cleanPrompt.indexOf("<thinking>");
        const thinkEnd = cleanPrompt.indexOf("</thinking>");
        if (thinkStart !== -1 && thinkEnd !== -1) {
            thinking = cleanPrompt.slice(thinkStart + 10, thinkEnd).trim();
            cleanPrompt = cleanPrompt.slice(thinkEnd + 11).trim();
        }

        // 去除 Markdown 代码块包裹（如 ```text 或 ``` 等）
        cleanPrompt = cleanPrompt.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();

        onProgress?.({
            stage: "complete",
            percent: 100,
            message: "Seedance-2.0 复刻提示词已成功生成！",
        });

        const maxDurationSec = resolveChannelVideoModelMaxDuration(effectiveConfig, targetModel) || 15;
        const minDurationSec = Math.min(5, maxDurationSec);
        return {
            prompt: cleanPrompt,
            thinking,
            recommendedDurationSec: Math.min(maxDurationSec, Math.max(minDurationSec, Math.round(prepared.durationSec))),
            assetMappings,
            orderedImages,
            audioFiles,
        };
    } finally {
        disposePreparedReverseVideo(prepared);
    }
}
// @opc-feature: seedance-replication-service [end]
