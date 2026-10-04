// @opc-feature: seedance-replication-service [start]
import { fetchVaultPrompt, VAULT_PROMPT_IDS } from "@/services/api/prompt-vault";
import { imageToDataUrl } from "@/services/image-storage";
import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";
import { resolveModelForCapability, type AiConfig } from "@/stores/use-config-store";
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

const FALLBACK_SYSTEM_PROMPT = `你是一位专精于字节跳动 Seedance-2.0 视频扩散大模型（DiT架构）的参考视频编辑与提示词工程专家。

【核心任务】：
基于用户提供的[参考视频抽帧拼图]、[替换素材(@图片1商品、@图片2人物、@图片3背景)]及[补充说明]，生成一段直接喂给 Seedance-2.0 执行的高密度指令式纯文本提示词。

【Seedance-2.0 核心运行机制与必须遵守的 4 大铁律】：
1. 资产索引契约铁律：
   必须严格采用原生多模态指针格式：@视频1、@图片1（商品）、@图片2（人物）、@图片3（背景）。严禁使用模型不识别的自定义标签（如@商品1、@背景1）。
   当用户上传多个商品、人物或背景素材时，按编号自然排列（如@图片1（商品正面）、@图片2（商品细节））。

2. 篇幅与注意力铁律：
   输出总字数必须严格控制在 250 ~ 320 汉字之间。剔除所有修饰性形容词与无关环境流水账，确保每句话都直接占用高权重交叉注意力（Cross-Attention）。

3. 深度推演【动作连锁同步变化与场景重光照】：
   - 因果演进：动作施加的受体部位，必须随原片动作时序同步呈现物理/色彩/质感改变（如：抹口红唇部实时上色水光化、倒液体液面同步上升、推面霜皮肤实时乳化润泽、按压时皮肤与物体产生弹性凹陷）；
   - 静态转工作态：静态素材图随动作进入真实的开启/手持使用状态，保持真实人体工学比例；
   - 场景与全局重光照：若有背景替换，人物与商品必须彻底吸收新背景的光源方向与色温，脚底与台面产生真实接触软阴影，镜头推移展现三维深度视差，发丝与透明介质处彻底透出新背景，清除旧场景残影。

4. 正向锁死物理约束（代替低效负面词）：
   杜绝使用“严禁变脸、严禁穿模”等容易引发粉色大象反向激活的负面词汇，统一采用正向绝对控制：
   - 面部：全程严格锁定指定人物的原生面部骨相与五官特征，维持绝对单一人貌一致性；
   - 手部：手指与物体维持清晰物理层叠与独立边缘轮廓，形成真实紧密握持咬合；
   - 动作：受体状态必须严格跟随交互动作实时演变，杜绝动作在进行而受体状态静止割裂；
   - 画面：发丝与物体边缘完全透出新背景，维持纯净实拍质感，无任何旧片残留或字幕水印。

【标准输出结构】：
仅输出一段高密度纯文本，严格采用以下三段式结构（每段直接输出具体内容，不要输出多余解释）：
【基于@视频1参考复刻与映射】...（声明运镜保留，绑定@图片1/2/3）
【动作连锁演进与场景重构】...（重点交代时序动作中的受体同步变化、功能态及全局光照吸收）
【正向物理锁死约束】...（骨相锁死、手物咬合、新环境净空穿透与纯净画面）`;

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

        // 5. 拉取后端金库元提示词（带热更与本地回退）
        let systemPrompt = FALLBACK_SYSTEM_PROMPT;
        try {
            const vaultPrompt = await fetchVaultPrompt(VAULT_PROMPT_IDS.SEEDANCE_REPLICATION);
            if (vaultPrompt && vaultPrompt.trim().length > 50) {
                systemPrompt = vaultPrompt.trim();
            }
        } catch (e) {
            console.warn("[seedance-replication] 读取金库提示词失败，采用内置标准元提示词:", e);
        }

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
            { signal, scene: "video_replication" },
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

        return {
            prompt: cleanPrompt,
            thinking,
            recommendedDurationSec: Math.min(15, Math.max(5, Math.round(prepared.durationSec))),
            assetMappings,
            orderedImages,
            audioFiles,
        };
    } finally {
        disposePreparedReverseVideo(prepared);
    }
}
// @opc-feature: seedance-replication-service [end]
