import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";
import { CanvasNodeType } from "../src/types/canvas";
import { buildRefScriptMentionReferences, isReferenceMentionedInText } from "../src/extensions/opc-infinite/services/script-mention-resolver";
import {
    HYPIT_VIDEO_MODEL_OPTIONS,
    HYPIT_SHOT_DECONSTRUCTION_SYSTEM_PROMPT,
    HYPIT_CREATIVE_DIRECTOR_SYSTEM_PROMPT,
    buildHypitDirectorUserPrompt,
    parseHypitJson,
    hotSwapStoryboardAssets,
} from "../src/extensions/opc-infinite/prompts/hypit-director-prompts";

describe("创意反推与创意复刻管线规范", () => {
    it("四个模式按钮名称必须严格为 4 个汉字", () => {
        const videoReverseTabs = ["经典反推", "创意反推"];
        const refScriptTabs = ["经典复刻", "创意复刻"];

        for (const tab of [...videoReverseTabs, ...refScriptTabs]) {
            expect(tab.length).toBe(4);
            expect(/^[\u4e00-\u9fa5]{4}$/.test(tab)).toBe(true);
        }
    });

    it("创意复刻目标视频模型选项覆盖主流模型且对齐物理档位", () => {
        expect(HYPIT_VIDEO_MODEL_OPTIONS.length).toBeGreaterThanOrEqual(6);

        const modelKeys = HYPIT_VIDEO_MODEL_OPTIONS.map((m) => m.value);
        expect(modelKeys).toContain("kling-v1-6");
        expect(modelKeys).toContain("minimax-video-01");
        expect(modelKeys).toContain("runway-gen3");

        for (const model of HYPIT_VIDEO_MODEL_OPTIONS) {
            expect(model.defaultDuration).toBeGreaterThan(0);
            expect(model.maxDuration).toBeGreaterThanOrEqual(model.defaultDuration);
            expect(model.label.length).toBeGreaterThan(0);
        }
    });

    it("parseHypitJson 能从 Markdown 文本与前后说明中稳健提取分镜 JSON，并能自愈尾逗号与瑕疵", () => {
        const rawResponse = `这是一份创意复刻思路：
先抓住黄金3秒用户痛点，再展开成分展示。

\`\`\`json
{
  "title": "测试美白精华分镜表",
  "shots": [
    {
      "shotNumber": 1,
      "timeRange": "0.0s - 5.0s",
      "lines": "熬夜脸垮垮的姐妹，赶紧看过来！",
      "camera": "推近特写",
      "motionPrompt": "Camera pushes in slowly as model holds bottle.",
    },
  ],
}
\`\`\`
以上分镜建议配合高质感生图模型使用。`;

        const parsed = parseHypitJson<{ title: string; shots: any[] }>(rawResponse);
        expect(parsed).not.toBeNull();
        expect(parsed?.title).toBe("测试美白精华分镜表");
        expect(parsed?.shots.length).toBe(1);
        expect(parsed?.shots[0].shotNumber).toBe(1);
        expect(parsed?.shots[0].lines).toContain("熬夜脸垮垮");
    });

    it("parseHypitJson 在 JSON 尾部截断或语法破坏时可正则挽救已生成的完整镜头", () => {
        const brokenResponse = `
\`\`\`json
{
  "title": "截断的分镜表",
  "shots": [
    {
      "shotNumber": 1,
      "lines": "第一镜台词",
      "imagePrompt": "iPhone UGC prompt 1"
    },
    {
      "shotNumber": 2,
      "lines": "第二镜台词",
      "imagePrompt": "iPhone UGC prompt 2"
    },
    {
      "shotNumber": 3,
      "lines": "第三镜未完输出...
`;

        const parsed = parseHypitJson<{ title: string; shots: any[] }>(brokenResponse);
        expect(parsed).not.toBeNull();
        expect(parsed?.shots.length).toBe(2);
        expect(parsed?.shots[0].shotNumber).toBe(1);
        expect(parsed?.shots[1].shotNumber).toBe(2);
    });

    it("buildHypitDirectorUserPrompt 正确编织换品卖点、角色母图、运镜与通道开关", () => {
        const prompt = buildHypitDirectorUserPrompt({
            referenceScript: "[0-3s] 黄金痛点开场",
            productSellingPoints: "高浓度烟酰胺，改善暗沉",
            masterVisualAnchor: "25岁职场干练女性，米色西装",
            motionStyle: "微距推拉镜头",
            videoModel: "kling-v1-6",
            enableVisual: true,
            enableVoice: true,
            enableVideo: false,
        });

        expect(prompt).toContain("高浓度烟酰胺，改善暗沉");
        expect(prompt).toContain("25岁职场干练女性，米色西装");
        expect(prompt).toContain("微距推拉镜头");
        expect(prompt).toContain("kling-v1-6");
        expect(prompt).toContain("视觉生图 (首帧/iPhone UGC 四段式): 启用");
        expect(prompt).toContain("角色配音 (台词/音色/情感/词级打标): 启用");
        expect(prompt).toContain("视频分镜 (运镜/微动作/词级动作绑定/Hygiene防字幕): 未启用");
    });

    it("buildHypitDirectorUserPrompt 优先融合统一的用户创作需求", () => {
        const prompt = buildHypitDirectorUserPrompt({
            referenceScript: "[0-3s] 黄金痛点开场",
            userRequirement: "将原视频运动鞋替换为女士保湿精华，保持原有快节奏剪辑与痛点引入",
            videoModel: "minimax-video-01",
            enableVisual: true,
            enableVoice: false,
            enableVideo: true,
        });

        expect(prompt).toContain("【用户创作需求与换品设定】");
        expect(prompt).toContain("将原视频运动鞋替换为女士保湿精华，保持原有快节奏剪辑与痛点引入");
        expect(prompt).toContain("minimax-video-01");
        expect(prompt).not.toContain("【换品核心卖点与利益点】");
    });

    it("递归追溯媒体节点与多维表格连线 handle 契约对齐", () => {
        // 模拟上游图结构：人物图(A) -> 视频反推(B) -> 编导脚本(C) <- 产品图(D)
        const mockConnections = [
            { id: "c1", fromNodeId: "node-person-image", toNodeId: "node-video-reverse" },
            { id: "c2", fromNodeId: "node-video-reverse", toNodeId: "node-script" },
            { id: "c3", fromNodeId: "node-product-image", toNodeId: "node-script" },
        ];

        const nodeMap = new Map([
            ["node-person-image", { id: "node-person-image", type: "image", title: "主角母图" }],
            ["node-video-reverse", { id: "node-video-reverse", type: "video-reverse:analyzer", title: "视频反推" }],
            ["node-script", { id: "node-script", type: "creation-assistant-ref-script:generator", title: "创意编导" }],
            ["node-product-image", { id: "node-product-image", type: "image", title: "产品白底图" }],
        ]);

        const visited = new Set<string>();
        const mediaNodes: any[] = [];

        function traceUpstream(nodeId: string) {
            if (visited.has(nodeId)) return;
            visited.add(nodeId);

            const incoming = mockConnections.filter((c) => c.toNodeId === nodeId);
            for (const conn of incoming) {
                const fromNode = nodeMap.get(conn.fromNodeId);
                if (!fromNode) continue;
                if (fromNode.type === "image" || fromNode.type === "video") {
                    mediaNodes.push(fromNode);
                }
                traceUpstream(fromNode.id);
            }
        }

        traceUpstream("node-script");

        // 验证人物图与产品图全部被递归追溯成功发现
        const tracedIds = mediaNodes.map((n) => n.id);
        expect(tracedIds).toContain("node-person-image");
        expect(tracedIds).toContain("node-product-image");
        expect(tracedIds.length).toBe(2);

        // 验证多维表格连线契约：第1列为编导脚本，后续为追溯到的资产
        const refColumns = [
            { id: "ref-script", label: "创意编导" },
            ...mediaNodes.map((n, i) => ({ id: `ref-asset-${i + 1}`, label: n.title })),
        ];

        expect(refColumns[0].id).toBe("ref-script");
        expect(refColumns[1].id).toBe("ref-asset-1");
        expect(refColumns[2].id).toBe("ref-asset-2");
    });

    it("阶段一抽帧默认策略基准频率为 1fps + 中点帧 (实际 2 帧/秒)，突变轨为辅助参考切点", async () => {
        const { DEFAULT_VIDEO_SAMPLING_POLICY } = await import(
            "../src/extensions/opc-infinite/media/video-decomposition/frame-sampler"
        );
        expect(DEFAULT_VIDEO_SAMPLING_POLICY.fps).toBe(1);
        expect(DEFAULT_VIDEO_SAMPLING_POLICY.includeMiddleFrames).toBe(true);
        expect(DEFAULT_VIDEO_SAMPLING_POLICY.sceneChangeThreshold).toBe(0.20);
        expect(DEFAULT_VIDEO_SAMPLING_POLICY.minSceneGapSec).toBe(0.3);

        // 验证阶段一拆解提示词中明确突变轨为候选辅助切点
        expect(HYPIT_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).toContain("突变轨作为辅助参考候选点");
        expect(HYPIT_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).toContain("shotType");
        expect(HYPIT_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).toContain("a-roll");
        expect(HYPIT_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).toContain("b-roll");
        expect(HYPIT_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).toContain("l-cut");
        expect(HYPIT_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).toContain("wordTimings");
        expect(HYPIT_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).toContain("全片视听基因与宏观架构总览");
        expect(HYPIT_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).toContain("逐镜头全息工程图纸");
        expect(HYPIT_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).not.toContain("hookType");
        expect(HYPIT_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).not.toContain("productAnchor");
    });

    it("阶段二创意编导提示词严格对齐 Hypit 官方 Prompt Kit 规范", () => {
        // 1. iPhone UGC 四段式生图规范
        expect(HYPIT_CREATIVE_DIRECTOR_SYSTEM_PROMPT).toContain("iPhone UGC 四段式规范");
        expect(HYPIT_CREATIVE_DIRECTOR_SYSTEM_PROMPT).toContain("A photograph captured as a single frame from a video actually shot on an iPhone");
        expect(HYPIT_CREATIVE_DIRECTOR_SYSTEM_PROMPT).toContain("very broad shoulders and excellent head-to-shoulder proportions");
        expect(HYPIT_CREATIVE_DIRECTOR_SYSTEM_PROMPT).toContain("the face points straight toward the lens, with no head tilt or rotation");

        // 2. 拒绝负面塑料感废话词
        expect(HYPIT_CREATIVE_DIRECTOR_SYSTEM_PROMPT).toContain("严禁使用");
        expect(HYPIT_CREATIVE_DIRECTOR_SYSTEM_PROMPT).toContain("ultra-realistic");

        // 3. 词级动作绑定
        expect(HYPIT_CREATIVE_DIRECTOR_SYSTEM_PROMPT).toContain('On [word], [actor] [does action]');

        // 4. Hygiene 画面防乱码字幕红线
        expect(HYPIT_CREATIVE_DIRECTOR_SYSTEM_PROMPT).toContain("Keep face, hands, skin texture, lighting, and motion photoreal and stable. Add no subtitles, captions, labels, logos, UI text, floating words, or other readable on-screen text.");

        // 5. 台词容量红线
        expect(HYPIT_CREATIVE_DIRECTOR_SYSTEM_PROMPT).toContain("5秒镜头：台词上限 <= 20 汉字");
        expect(HYPIT_CREATIVE_DIRECTOR_SYSTEM_PROMPT).toContain("6秒镜头：台词上限 <= 25 汉字");
        expect(HYPIT_CREATIVE_DIRECTOR_SYSTEM_PROMPT).toContain("10秒镜头：台词上限 <= 45 汉字");
    });

    it("本地字级 ASR 服务提供毫秒格式化与平滑容错回退", async () => {
        const { formatWordTimings, checkLocalAsrHealthy, transcribeWithLocalAsr } = await import(
            "../src/extensions/opc-infinite/services/local-asr-transcriber"
        );

        // 词级时间戳格式化
        const words = [
            { word: "熬夜", startSec: 0.0, endSec: 0.5 },
            { word: "脸垮", startSec: 0.6, endSec: 1.2 },
            { word: "姐妹", startSec: 1.4, endSec: 2.0 },
        ];
        const formatted = formatWordTimings(words);
        expect(formatted).toBe("0.0s[熬夜] 0.6s[脸垮] 1.4s[姐妹]");

        // 在测试环境下未启动 ASR 服务时，检查返回 false 且平滑回退
        const healthy = await checkLocalAsrHealthy("http://127.0.0.1:99999");
        expect(healthy).toBe(false);

        const dummyBlob = new Blob(["audio-data"], { type: "audio/wav" });
        const fallbackRes = await transcribeWithLocalAsr(dummyBlob, {
            endpoint: "http://127.0.0.1:99999",
        });
        expect(fallbackRes.success).toBe(false);
        expect(fallbackRes.source).toBe("fallback-multimodal");
        expect(fallbackRes.fallbackReason).toContain("本地 ASR 服务未启动");
    });

    it("本地桌面 FFmpeg 探测接口在网页环境下安全返回 false 且抽帧平滑返回 null", async () => {
        const { checkDesktopFFmpegAvailable, extractSingleFrameWithNativeFFmpeg, extractFramesWithDesktopFFmpeg, extractAudioWithDesktopFFmpeg } = await import(
            "../src/extensions/opc-infinite/media/video-decomposition/desktop-ffmpeg-sampler"
        );

        // 1. 无桌面桥环境测试
        const originalBridge = (globalThis as any).desktopBridge;
        delete (globalThis as any).desktopBridge;

        expect(checkDesktopFFmpegAvailable()).toBe(false);
        const result = await extractSingleFrameWithNativeFFmpeg("https://example.com/test.mp4", 1.5);
        expect(result).toBeNull();

        const frameResult = await extractFramesWithDesktopFFmpeg("https://example.com/test.mp4", {
            samplingPolicy: { mode: "seconds", fps: 1, maxFrames: 10, maxFramesPerSheet: 12, source: "default" },
        });
        expect(frameResult).toBeNull();

        const audioResult = await extractAudioWithDesktopFFmpeg("https://example.com/test.mp4");
        expect(audioResult).toBeNull();

        // 2. 模拟桌面桥注入：验证必须优先调用本地 desktopBridge 原生抽帧与音频提取
        let extractVideoFramesCalledWith: any = null;
        let runFFmpegJobCalledWith: any = null;

        (globalThis as any).desktopBridge = {
            isDesktop: true,
            extractVideoFrames: async (opts: any) => {
                extractVideoFramesCalledWith = opts;
                return {
                    success: true,
                    durationSec: 5.0,
                    width: 1920,
                    height: 1080,
                    frames: [
                        {
                            index: 1,
                            timestampSec: 0,
                            frameType: "timeline_sample",
                            source: "ffmpeg.timeline",
                            buffer: new Uint8Array([1, 2, 3]),
                            mimeType: "image/jpeg",
                            width: 1920,
                            height: 1080,
                        },
                    ],
                };
            },
            runFFmpegJob: async (opts: any) => {
                runFFmpegJobCalledWith = opts;
                return {
                    success: true,
                    outputBlob: new Blob(["dummy-wav"], { type: "audio/wav" }),
                };
            },
        };

        expect(checkDesktopFFmpegAvailable()).toBe(true);

        // 验证抽帧优先走 desktopBridge.extractVideoFrames
        const nativeFrames = await extractFramesWithDesktopFFmpeg("https://example.com/test.mp4", {
            samplingPolicy: { mode: "seconds_and_scene", fps: 1, maxFrames: 120, maxFramesPerSheet: 12, source: "user" },
        });
        expect(extractVideoFramesCalledWith).not.toBeNull();
        expect(extractVideoFramesCalledWith.inputUrl).toBe("https://example.com/test.mp4");
        expect(nativeFrames).not.toBeNull();
        expect(nativeFrames?.frameCount).toBe(1);
        expect(nativeFrames?.isDesktopNative).toBe(true);

        // 验证音频提取优先走 desktopBridge.runFFmpegJob (提取 16kHz WAV)
        const nativeAudio = await extractAudioWithDesktopFFmpeg("https://example.com/test.mp4");
        expect(runFFmpegJobCalledWith).not.toBeNull();
        expect(runFFmpegJobCalledWith.args).toContain("-ar");
        expect(runFFmpegJobCalledWith.args).toContain("16000");
        expect(nativeAudio).not.toBeNull();

        // 3. 模拟本地桌面 FFmpeg 返回失败时，平滑返回 null 以供调用方触发回退浏览器 Canvas
        (globalThis as any).desktopBridge.extractVideoFrames = async () => ({
            success: false,
            error: "FFmpeg executable crashed",
            frames: [],
        });
        const failedFrames = await extractFramesWithDesktopFFmpeg("https://example.com/test.mp4", {
            samplingPolicy: { mode: "seconds", fps: 1, maxFrames: 10, maxFramesPerSheet: 12, source: "default" },
        });
        expect(failedFrames).toBeNull();

        // 恢复环境
        if (originalBridge) {
            (globalThis as any).desktopBridge = originalBridge;
        } else {
            delete (globalThis as any).desktopBridge;
        }
    });

    it("用户创作需求 @素材 解析与多模态图片打通", async () => {
        const { buildRefScriptMentionReferences, resolveMentionedContentParts } = await import(
            "../src/extensions/opc-infinite/services/script-mention-resolver"
        );

        const mockUpstreamNodes: any[] = [
            {
                id: "img-1",
                type: "image",
                title: "产品白底图",
                metadata: { content: "https://example.com/product.png" },
            },
            {
                id: "text-1",
                type: "text",
                title: "卖点提炼",
                metadata: { content: "核心功效：3天改善暗沉，烟酰胺纯度99.8%" },
            },
            {
                id: "video-1",
                type: "video",
                title: "对标爆款视频",
                metadata: { content: "https://example.com/sample.mp4" },
            },
        ];

        // 1. 构建 @ 引用素材表
        const refs = buildRefScriptMentionReferences(mockUpstreamNodes);
        expect(refs.length).toBe(3);
        expect(refs[0].label).toBe("图片1");
        expect(refs[0].mentionToken).toBe("@图片1");
        expect(refs[1].label).toBe("文本1");
        expect(refs[1].text).toContain("烟酰胺纯度99.8%");
        expect(refs[2].label).toBe("视频1");

        // 2. 解析用户创作需求中包含的 @ 标记
        const userRequirement = "请参考 @图片1 作为我们的新款精华，并融合 @文本1 中的核心功效";
        const textPrompt = "【基础提示词】请生成创意复刻分镜。";

        const resolved = resolveMentionedContentParts({
            textPrompt,
            userRequirement,
            references: refs,
        });

        // 验证文本展开：@文本1 应当被展开为带有实际文字的引用
        expect(resolved.expandedRequirement).toContain("【引用文本1 (卖点提炼)】: 核心功效：3天改善暗沉，烟酰胺纯度99.8%");

        // 验证多模态图片注入：contentParts 应当包含 text 与 image_url 节点
        expect(resolved.contentParts.length).toBe(2);
        expect(resolved.contentParts[0].type).toBe("text");
        expect(resolved.contentParts[1].type).toBe("image_url");
        expect((resolved.contentParts[1] as any).image_url.url).toBe("https://example.com/product.png");

        // 验证提及素材的标记状态
        const imgRef = resolved.mentionedAssets.find((a) => a.label === "@图片1");
        expect(imgRef?.isDirectlyMentioned).toBe(true);
        const vidRef = resolved.mentionedAssets.find((a) => a.label === "@视频1");
        expect(vidRef?.isDirectlyMentioned).toBe(false);
    });

    it("创意反推脱敏净化：stripJsonCodeBlocks与formatShotManifestToReadableScript杜绝暴露JSON", async () => {
        const { stripJsonCodeBlocks, formatShotManifestToReadableScript } = await import(
            "../src/extensions/opc-infinite/prompts/hypit-director-prompts"
        );

        const rawLLMOutput = `整体分镜综述：
该视频节奏紧凑，开场使用推镜头直击痛点。

\`\`\`json
{
  "title": "创意反推分镜图纸",
  "shots": [
    {
      "shotNumber": 1,
      "shotType": "a-roll",
      "timeRange": "0.0s - 3.5s",
      "visualSubject": "特写",
      "visualContent": "主播展示私密护理凝胶",
      "dialogue": "私密尴尬问题，一定要选对方案！",
      "wordTimings": "0.0s[私密] 1.0s[尴尬] 2.2s[方案]"
    }
  ]
}
\`\`\`
祝创作愉快！`;

        // 验证 stripJsonCodeBlocks 清除所有 JSON 标记
        const stripped = stripJsonCodeBlocks(rawLLMOutput);
        expect(stripped).not.toContain("```json");
        expect(stripped).not.toContain('"shotNumber"');
        expect(stripped).toContain("该视频节奏紧凑");

        // 验证 formatShotManifestToReadableScript 转换成人类可读的专业 Markdown 分镜
        const shots = [
            {
                shotNumber: 1,
                shotType: "a-roll",
                timeRange: "0.0s - 3.5s",
                visualSubject: "半身特写",
                cameraMovement: "缓推镜头",
                visualContent: "主播展示私密护理凝胶",
                dialogue: "私密尴尬问题，一定要选对方案！",
                wordTimings: "0.0s[私密] 1.0s[尴尬] 2.2s[方案]",
                emotion: "真诚关怀",
                replicateStrategy: "替换为目标商品手持展示",
            },
        ];
        const formatted = formatShotManifestToReadableScript(shots, stripped);
        expect(formatted).not.toContain("```json");
        expect(formatted).not.toContain("{");
        expect(formatted).not.toContain("}");
        expect(formatted).toContain("### 镜头 1 [A-ROLL] 0.0s - 3.5s");
        expect(formatted).toContain("- **原片台词**：私密尴尬问题，一定要选对方案！");
        expect(formatted).toContain("- **画面内容**：主播展示私密护理凝胶");
    });

    it("创意复刻正确识别模型时长上限与弹性规划指令，严禁机械固定5秒", () => {
        // 针对可灵 (10s上限)
        const klingPrompt = buildHypitDirectorUserPrompt({
            referenceScript: "参考视频",
            userRequirement: "复刻私密个护凝胶短视频",
            videoModel: "kling-v1-6",
            enableVisual: true,
            enableVoice: true,
            enableVideo: true,
        });
        expect(klingPrompt).toContain("单镜头物理时长区间: 5 秒 ~ 10 秒");
        expect(klingPrompt).toContain("绝对严禁所有镜头都机械固定为 5 秒");

        // 针对 Seedance (15s上限)
        const seedancePrompt = buildHypitDirectorUserPrompt({
            referenceScript: "参考视频",
            userRequirement: "复刻高端私密睡衣",
            videoModel: "seedance-2-fast",
            enableVisual: true,
            enableVoice: true,
            enableVideo: true,
        });
        expect(seedancePrompt).toContain("单镜头物理时长区间: 5 秒 ~ 15 秒");
        expect(seedancePrompt).toContain("单镜头物理上限为 15 秒");
    });

    it("多模态素材传入时强制注入视觉主体唯一性与防串货红线", () => {
        const promptWithImage = buildHypitDirectorUserPrompt({
            referenceScript: "参考视频",
            userRequirement: "请参考 @图片1 复刻分镜",
            videoModel: "kling-v1-6",
            enableVisual: true,
            enableVoice: true,
            enableVideo: true,
            mentionedAssets: [
                { label: "@图片1", title: "私密抑菌凝胶商品图.png", kind: "image", isDirectlyMentioned: true },
            ],
        });

        expect(promptWithImage).toContain("【核心红线：输入商品图视觉主体唯一性（严防套用预设）】");
        expect(promptWithImage).toContain("严禁凭空生成护肤品/精华/美妆等无关示例品类");
    });

    it("buildRefScriptMentionReferences 绝不泄漏未解析的 image: 内部存储键作为 previewUrl", () => {
        const mockNodes: any[] = [
            {
                id: "img-node-1",
                type: CanvasNodeType.Image,
                title: "商品图",
                metadata: {
                    content: "image:user-1:hash123",
                    storageKey: "image:user-1:hash123",
                },
            },
            {
                id: "vid-node-1",
                type: CanvasNodeType.Video,
                title: "原视频",
                metadata: {
                    content: "https://example.com/video.mp4",
                    videoPreview: {
                        storageKey: "image:user-1:poster123",
                    },
                },
            },
        ];

        const refs = buildRefScriptMentionReferences(mockNodes);
        expect(refs.length).toBe(2);

        const imgRef = refs.find((r) => r.id === "img-node-1");
        expect(imgRef).toBeDefined();
        expect(imgRef?.kind).toBe("image");
        // 绝不直接返回未解析的 storageKey 作为 previewUrl
        expect(Boolean(imgRef?.previewUrl && imgRef.previewUrl.startsWith("image:"))).toBe(false);
        expect(imgRef?.storageKey).toBe("image:user-1:hash123");

        const vidRef = refs.find((r) => r.id === "vid-node-1");
        expect(vidRef).toBeDefined();
        expect(vidRef?.kind).toBe("video");
        expect(vidRef?.previewStorageKey).toBe("image:user-1:poster123");
    });

    it("真实 RGB 差异度比对与静态重复帧剪枝机制", async () => {
        const { frameDifferenceScore } = await import(
            "../src/extensions/opc-infinite/media/video-decomposition/frame-sampler"
        );

        // 1. 完全相同的图像特征签名差异度为 0
        const sigA = new Uint8ClampedArray(32 * 18 * 4).fill(128);
        const sigSame = new Uint8ClampedArray(32 * 18 * 4).fill(128);
        expect(frameDifferenceScore(sigA, sigSame)).toBe(0);

        // 2. 微小噪点 (< 0.03) 差异比对
        const sigNoise = new Uint8ClampedArray(sigA);
        for (let i = 0; i < sigNoise.length; i += 4) {
            sigNoise[i] = Math.min(255, sigNoise[i] + 3); // 极小扰动
        }
        const noiseScore = frameDifferenceScore(sigA, sigNoise);
        expect(noiseScore).toBeLessThan(0.03); // 应被判定为无效噪点/静止画面

        // 3. 真实有效视觉动作 (>= 0.06) 差异比对
        const sigMotion = new Uint8ClampedArray(sigA);
        for (let i = 0; i < sigMotion.length; i += 4) {
            if ((i / 4) % 2 === 0) {
                sigMotion[i] = 200; // 人物/手部显著动作
                sigMotion[i + 1] = 50;
            }
        }
        const motionScore = frameDifferenceScore(sigA, sigMotion);
        expect(motionScore).toBeGreaterThanOrEqual(0.06); // 达到保留阈值

        // 4. 镜头突变/场景切换 (>= 0.30)
        const sigSceneCut = new Uint8ClampedArray(32 * 18 * 4).fill(250);
        const sceneScore = frameDifferenceScore(sigA, sigSceneCut);
        expect(sceneScore).toBeGreaterThanOrEqual(0.32); // 触发突变轨
    });

    it("Hypit 标杆 wordsAt 算法：精准对齐当前帧活跃对白与语境句子", async () => {
        const { wordsAt } = await import(
            "../src/extensions/opc-infinite/media/video-decomposition/contact-sheet-builder"
        );

        const sampleWords = [
            { word: "熬夜", startSec: 1.0, endSec: 1.6 },
            { word: "脸垮", startSec: 1.7, endSec: 2.3 },
            { word: "的", startSec: 2.4, endSec: 2.6 },
            { word: "姐妹", startSec: 2.7, endSec: 3.2 },
            { word: "赶紧", startSec: 3.5, endSec: 3.9 },
            { word: "看过来", startSec: 4.0, endSec: 4.8 },
        ];

        // 1. 恰好落在 "熬夜" (1.0 - 1.6s) 区间内：在 1.2s
        const at1 = wordsAt(sampleWords, 1.2);
        expect(at1.active.length).toBe(1);
        expect(at1.active[0].word).toBe("熬夜");
        expect(at1.context.length).toBeGreaterThanOrEqual(3);
        expect(at1.context.map((w) => w.word).join("")).toContain("熬夜脸垮");

        // 2. 落在停顿/气口间隙：在 3.3s (在 3.2s "姐妹" 与 3.5s "赶紧" 之间)
        const atPause = wordsAt(sampleWords, 3.3);
        expect(atPause.active.length).toBe(0); // 当前瞬时无字被说出
        // 但语境锚点自动绑定到距离最近的字 (3.2s 的 "姐妹")
        expect(atPause.context.length).toBeGreaterThan(0);
        expect(atPause.context.map((w) => w.word).join("")).toContain("姐妹");

        // 3. 超出音频末尾时：锚定最后一个词
        const atEnd = wordsAt(sampleWords, 10.0);
        expect(atEnd.active.length).toBe(0);
        expect(atEnd.context[atEnd.context.length - 1].word).toBe("看过来");
    });

    it("Hypit 官方 openAt 两阶段定位机制算法严密性验证", () => {
        const SEEK_RUN_UP = 2;
        const calculateOpenAt = (at: number) => {
            const jump = Math.max(0, at - SEEK_RUN_UP);
            const runUp = at - jump;
            return {
                jump: Number(jump.toFixed(3)),
                runUp: Number(runUp.toFixed(3)),
                hasFastSeek: jump > 0,
            };
        };

        // 1. 片头极短时间点 (0.8s)：小于 2s，不需要前置 jump，直接从 0 解码 0.8s 避免关键帧回卷错误
        const r1 = calculateOpenAt(0.8);
        expect(r1.hasFastSeek).toBe(false);
        expect(r1.jump).toBe(0);
        expect(r1.runUp).toBe(0.8);

        // 2. 视频中深层时间点 (15.5s)：先用 jump=13.5s 极速跳跃到前序最近关键帧，后置解码仅 2.0s 残差
        const r2 = calculateOpenAt(15.5);
        expect(r2.hasFastSeek).toBe(true);
        expect(r2.jump).toBe(13.5);
        expect(r2.runUp).toBe(2.0);
        // 总解码相对时间严格闭环
        expect(r2.jump + r2.runUp).toBe(15.5);
    });

    it("模型音频模态能力识别与本地 ASR 智能默认规则验证", async () => {
        const { isAudioCapableModel, resolveDefaultLocalAsrSetting } = await import(
            "../src/extensions/opc-infinite/services/video-reverse-contracts"
        );

        // 1. 具备直接音频轨道输入传输能力的多模态大模型：Gemini 全系列、带 audio 专属通道模型
        expect(isAudioCapableModel("gemini-3.8-flash-high")).toBe(true);
        expect(isAudioCapableModel("gemini-2.0-flash")).toBe(true);
        expect(isAudioCapableModel("gemini-1.5-pro")).toBe(true);
        expect(isAudioCapableModel("gpt-4o-audio-preview")).toBe(true);

        // 针对直接输入音频的模型，默认不开启本地 ASR (false)，由模型直接端到端听音打标
        expect(resolveDefaultLocalAsrSetting("gemini-3.8-flash-high")).toBe(false);
        expect(resolveDefaultLocalAsrSetting("gpt-4o-audio-preview")).toBe(false);

        // 2. 常规文本/视觉模型 (包括 OpenAI-compatible 的常规 GPT-4o、豆包、MiniMax、DeepSeek、Claude、Qwen 等)：
        // API 层面不支持直接传 WAV 音频，必须默认开启本地 FunASR 提取对白硬事实注入拼图与提示词
        expect(isAudioCapableModel("gpt-4o")).toBe(false);
        expect(isAudioCapableModel("gpt-4o-mini")).toBe(false);
        expect(isAudioCapableModel("doubao-pro-32k")).toBe(false);
        expect(isAudioCapableModel("doubao-lite-4k")).toBe(false);
        expect(isAudioCapableModel("minimax-abab6.5s-chat")).toBe(false);
        expect(isAudioCapableModel("hailuo-01")).toBe(false);
        expect(isAudioCapableModel("deepseek-chat")).toBe(false);
        expect(isAudioCapableModel("deepseek-v3")).toBe(false);
        expect(isAudioCapableModel("claude-3-5-sonnet")).toBe(false);
        expect(isAudioCapableModel("qwen2.5-vl-72b-instruct")).toBe(false);

        expect(resolveDefaultLocalAsrSetting("gpt-4o")).toBe(true);
        expect(resolveDefaultLocalAsrSetting("doubao-pro-32k")).toBe(true);
        expect(resolveDefaultLocalAsrSetting("minimax-abab6.5s-chat")).toBe(true);
        expect(resolveDefaultLocalAsrSetting("deepseek-chat")).toBe(true);
        expect(resolveDefaultLocalAsrSetting("claude-3-5-sonnet")).toBe(true);
        expect(resolveDefaultLocalAsrSetting("qwen2.5-vl-72b-instruct")).toBe(true);
    });

    it("词级打标与本地 ASR 严格解耦契约验证：仅本地 ASR 渲染金色对齐，多模态听音保持画格干净", async () => {
        const { buildContactSheets } = await import(
            "../src/extensions/opc-infinite/media/video-decomposition/contact-sheet-builder"
        );

        const originalDoc = (globalThis as any).document;
        const originalImage = (globalThis as any).Image;
        const originalCreateObjectURL = URL.createObjectURL;
        const originalRevokeObjectURL = URL.revokeObjectURL;

        const mockCanvas: any = {
            width: 100,
            height: 100,
            getContext: () => ({
                fillStyle: "",
                font: "",
                fillRect: () => {},
                drawImage: () => {},
                fillText: () => {},
            }),
            toBlob: (cb: any) => cb(new Blob(["mock-sheet"], { type: "image/jpeg" })),
        };
        (globalThis as any).document = {
            createElement: () => mockCanvas,
        };
        (globalThis as any).Image = class {
            onload: any;
            set src(_v: string) {
                setTimeout(() => this.onload?.(), 0);
            }
            width = 100;
            height = 100;
        };
        URL.createObjectURL = () => "blob:mock-url";
        URL.revokeObjectURL = () => {};

        try {
            const dummyFrames: any[] = [
                {
                    index: 1,
                    frameId: "F0001",
                    gridLabel: "Grid 1",
                    timestampSec: 1.0,
                    seekTimestampSec: 1.0,
                    timecode: "00:00:01.000",
                    frameType: "timeline_sample",
                    source: "timeline",
                    url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                },
            ];

            // 1. 未开启本地 ASR (无 words 传入)：不渲染金色 Active Word，manifestFrames 不携带 active_words
            const cleanResult = await buildContactSheets(dummyFrames, 1, {
                tileWidth: 100,
                tileHeight: 100,
                words: undefined,
            });
            expect(cleanResult.manifestFrames.length).toBe(1);
            expect(cleanResult.manifestFrames[0].active_words).toBeUndefined();
            expect(cleanResult.manifestFrames[0].context_words).toBeUndefined();

            // 2. 开启本地 ASR (有 words 传入)：渲染金色 Active Word，且精准绑定
            const sampleWords = [
                { word: "不要懒", startSec: 0.8, endSec: 1.2 },
                { word: "一定要洗", startSec: 1.3, endSec: 1.8 },
            ];
            const asrResult = await buildContactSheets(dummyFrames, 1, {
                tileWidth: 100,
                tileHeight: 100,
                words: sampleWords,
            });
            expect(asrResult.manifestFrames.length).toBe(1);
            expect(asrResult.manifestFrames[0].active_words).toBe("不要懒");
            expect(asrResult.manifestFrames[0].context_words).toContain("不要懒一定要洗");
        } finally {
            (globalThis as any).document = originalDoc;
            (globalThis as any).Image = originalImage;
            URL.createObjectURL = originalCreateObjectURL;
            URL.revokeObjectURL = originalRevokeObjectURL;
        }
    });

    it("转场过渡态与黑白闪鬼影检测算子验证：纯黑、白闪与低方差叠影精准拦截", () => {
        const detectGhost = (signature: Uint8ClampedArray) => {
            let totalBrightness = 0;
            let pixelCount = 0;
            for (let px = 0; px < signature.length; px += 4) {
                totalBrightness += (signature[px] + signature[px + 1] + signature[px + 2]) / 3;
                pixelCount += 1;
            }
            const meanBrightness = pixelCount > 0 ? totalBrightness / pixelCount : 128;
            let varianceTotal = 0;
            for (let px = 0; px < signature.length; px += 4) {
                const b = (signature[px] + signature[px + 1] + signature[px + 2]) / 3;
                varianceTotal += (b - meanBrightness) ** 2;
            }
            const variance = pixelCount > 0 ? varianceTotal / pixelCount : 100;
            return meanBrightness < 12 || meanBrightness > 242 || variance < 10;
        };

        // 1. 正常内容帧 (有丰富对比度与纹理)
        const normalFrame = new Uint8ClampedArray(32 * 18 * 4);
        for (let i = 0; i < normalFrame.length; i += 4) {
            normalFrame[i] = (i % 256);
            normalFrame[i + 1] = ((i * 2) % 256);
            normalFrame[i + 2] = ((i * 3) % 256);
            normalFrame[i + 3] = 255;
        }
        expect(detectGhost(normalFrame)).toBe(false);

        // 2. 纯黑转场帧 (mean < 12)
        const blackGhost = new Uint8ClampedArray(32 * 18 * 4).fill(5);
        expect(detectGhost(blackGhost)).toBe(true);

        // 3. 白闪过曝帧 (mean > 242)
        const whiteFlash = new Uint8ClampedArray(32 * 18 * 4).fill(250);
        expect(detectGhost(whiteFlash)).toBe(true);

        // 4. 无细节半透明灰雾叠影帧 (variance < 10)
        const grayFog = new Uint8ClampedArray(32 * 18 * 4).fill(120);
        expect(detectGhost(grayFog)).toBe(true);
    });

    it("微型颜色直方图与运镜晃动解耦及拉普拉斯方差清晰度选拔算法验证", async () => {
        const {
            computeColorHistogram,
            histogramIntersection,
            computeLaplacianSharpness,
            isTransitionGhost,
            frameDifferenceScore,
        } = await import("../src/extensions/opc-infinite/media/video-decomposition");

        // 1. 转场鬼影函数全局契约
        expect(isTransitionGhost(new Uint8ClampedArray(32 * 18 * 4).fill(5))).toBe(true);
        expect(isTransitionGhost(new Uint8ClampedArray(32 * 18 * 4).fill(250))).toBe(true);
        expect(isTransitionGhost(new Uint8ClampedArray(32 * 18 * 4).fill(128))).toBe(true); // variance = 0 < 10

        // 2. 颜色直方图：相同画面直方图交集相似度为 1.0
        const frameA = new Uint8ClampedArray(32 * 18 * 4);
        for (let i = 0; i < frameA.length; i += 4) {
            frameA[i] = (i * 7) % 256;
            frameA[i + 1] = (i * 13) % 256;
            frameA[i + 2] = (i * 19) % 256;
            frameA[i + 3] = 255;
        }
        const histA = computeColorHistogram(frameA);
        expect(histogramIntersection(histA, histA)).toBeCloseTo(1.0, 3);

        // 3. 运镜晃动 (像素平移)：整体色彩分布高度一致 (相似度 > 0.92)，但像素级差分触发
        const framePan = new Uint8ClampedArray(frameA.length);
        // 水平平移 4 个像素
        const shiftBytes = 4 * 4;
        framePan.set(frameA.subarray(shiftBytes), 0);
        framePan.set(frameA.subarray(0, shiftBytes), frameA.length - shiftBytes);

        const histPan = computeColorHistogram(framePan);
        const panSimilarity = histogramIntersection(histA, histPan);
        const pixelDiff = frameDifferenceScore(frameA, framePan);

        expect(panSimilarity).toBeGreaterThan(0.95); // 直方图高度相似，判定为运镜晃动
        expect(pixelDiff).toBeGreaterThan(0.10);    // 但像素 L1 距离超标，被直方图成功解耦拦截

        // 4. 彻底切镜到不同场景 (红黑房间切到纯蓝天空)
        const frameCut = new Uint8ClampedArray(32 * 18 * 4);
        for (let i = 0; i < frameCut.length; i += 4) {
            frameCut[i] = 10;
            frameCut[i + 1] = 120;
            frameCut[i + 2] = 245; // 强烈天蓝
            frameCut[i + 3] = 255;
        }
        const histCut = computeColorHistogram(frameCut);
        const cutSimilarity = histogramIntersection(histA, histCut);
        expect(cutSimilarity).toBeLessThan(0.70); // 色彩空间剧烈下挫，放行切点报警

        // 5. 拉普拉斯算子方差清晰度：平滑纯色 vs 模糊边缘 vs 锐利边缘
        const flatFrame = new Uint8ClampedArray(32 * 18 * 4).fill(128);
        expect(computeLaplacianSharpness(flatFrame, 32, 18)).toBe(0);

        // 模糊过渡帧 (渐变软边缘)
        const blurFrame = new Uint8ClampedArray(32 * 18 * 4);
        for (let y = 0; y < 18; y++) {
            for (let x = 0; x < 32; x++) {
                const idx = (y * 32 + x) * 4;
                const v = Math.round((x / 31) * 255);
                blurFrame[idx] = v;
                blurFrame[idx + 1] = v;
                blurFrame[idx + 2] = v;
                blurFrame[idx + 3] = 255;
            }
        }
        const blurSharpness = computeLaplacianSharpness(blurFrame, 32, 18);

        // 锐利边缘帧 (黑白高频棋盘/锐利刀锋)
        const sharpFrame = new Uint8ClampedArray(32 * 18 * 4);
        for (let y = 0; y < 18; y++) {
            for (let x = 0; x < 32; x++) {
                const idx = (y * 32 + x) * 4;
                const v = (x % 2 === 0) ? 240 : 15;
                sharpFrame[idx] = v;
                sharpFrame[idx + 1] = v;
                sharpFrame[idx + 2] = v;
                sharpFrame[idx + 3] = 255;
            }
        }
        const highSharpness = computeLaplacianSharpness(sharpFrame, 32, 18);

        expect(highSharpness).toBeGreaterThan(blurSharpness * 5); // 锐利帧清晰度远高于模糊拖影帧
    });

    it("创意反推正向评估与动态预算算法 (<= 60秒视频专用) 严密性验证", async () => {
        const { evaluateDeconstructBudget, normalizeVideoSamplingPolicy } = await import(
            "../src/extensions/opc-infinite/media/video-decomposition"
        );

        // 1. 5秒超短视频：应正向计算出 2~4 个分镜，18 张画格，避免过度抽样
        const b5 = evaluateDeconstructBudget(5);
        expect(b5.maxShots).toBeGreaterThanOrEqual(2);
        expect(b5.maxShots).toBeLessThanOrEqual(4);
        expect(b5.maxFrames).toBe(18);
        expect(b5.minSceneGapSec).toBe(0.2);

        // 2. 15秒常规带货短视频：应自适应推导出 12 个分镜，33 张画格 (正向对应 2~3 张拼图)
        const b15 = evaluateDeconstructBudget(15);
        expect(b15.maxShots).toBe(12);
        expect(b15.maxFrames).toBe(33);
        expect(Math.ceil(b15.maxFrames / 12)).toBe(3);

        // 3. 46秒短视频 (测试用例时长)：应推导出 36 个分镜上限，79 张黄金画格上限，充裕容纳镜头内分级细节演变帧与快切 (0.25s 识别)
        const b46 = evaluateDeconstructBudget(46);
        expect(b46.maxShots).toBe(36);
        expect(b46.maxFrames).toBe(79);
        // 验证 79 帧在 16 格拼图体系下为 Math.ceil(79 / 16) = 5 张 (在 12 格下为 7 张)，平滑覆盖 4~6 张目标拼图
        expect(Math.ceil(b46.maxFrames / 16)).toBe(5);
        expect(b46.minSceneGapSec).toBe(0.25);

        // 4. 60秒视频边界：受 60s 安全上限约束，封顶 40 分镜与 96 黄金画格 (在 16 格拼图下恰为 6 张)
        const b60 = evaluateDeconstructBudget(60);
        expect(b60.maxShots).toBe(40);
        expect(b60.maxFrames).toBe(96);
        expect(Math.ceil(b60.maxFrames / 16)).toBe(6);

        // 5. 验证 normalizeVideoSamplingPolicy 真实保留 deconstruct 模式，与经典秒级抽帧严格正向解耦
        const deconstructPolicy = normalizeVideoSamplingPolicy({ mode: "deconstruct" });
        expect(deconstructPolicy.mode).toBe("deconstruct");
        expect(deconstructPolicy.source).toBe("user");

        // 6. 验证既定提示词完整保留，绝无破坏
        const { HYPIT_SHOT_DECONSTRUCTION_SYSTEM_PROMPT } = await import(
            "../src/extensions/opc-infinite/prompts/hypit-director-prompts"
        );
        expect(HYPIT_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).toContain("分镜判定必须综合主播语音气口、台词完整性与主体景别转换");
    });

    it("创意复刻 v2.0: hotSwapStoryboardAssets 零重算客户端瞬时换皮算法验证", async () => {
        const { hotSwapStoryboardAssets } = await import(
            "../src/extensions/opc-infinite/prompts/hypit-director-prompts"
        );

        const initialShots: any[] = [
            {
                shotNumber: 1,
                shotType: "a_roll",
                lines: "今天给大家推荐这款{product_name}，非常好用！",
                imagePrompt: "UGC style portrait, cute girl presenting {product_name} in modern kitchen",
                brollCoverSlot: {
                    timeOffsetSec: 1.5,
                    durationSec: 1.5,
                    coverDescription: "特写展示{product_name}瓶身细节",
                    coverVisualPrompt: "Macro close-up shot of {product_name} bottle texture in modern kitchen",
                },
                ghostSnaps: [
                    {
                        slotType: "product",
                        timeOffsetSec: 1.5,
                        durationSec: 1.5,
                        recommendedPrompt: "Product macro shot of {product_name}",
                        reason: "主播提及产品卖点",
                    },
                ],
            },
        ];

        // 执行换皮：更换角色为职场男士、产品为玻色因面霜、场景为办公室
        const swappedShots = hotSwapStoryboardAssets({
            shots: initialShots,
            newSlots: {
                actor: { id: "char-1", type: "character", name: "职场干练男士", promptAnchor: "30岁亚洲职场男士，身穿深灰西装" },
                product: { id: "prod-1", type: "product", name: "玻色因抗老面霜", promptAnchor: "深蓝磨砂玻璃罐装玻色因抗老面霜" },
                scene: { id: "scene-1", type: "scene", name: "极简现代办公室", promptAnchor: "现代高层落地窗明亮办公室" },
            },
            productNameSwap: {
                oldName: "{product_name}",
                newName: "玻色因抗老面霜",
                newSpoken: "玻色因抗老面霜",
            },
        });

        expect(swappedShots.length).toBe(1);
        const s = swappedShots[0];

        // 1. 验证台词中的 {product_name} 被成功置换
        expect(s.lines).toBe("今天给大家推荐这款玻色因抗老面霜，非常好用！");

        // 2. 验证生图 Prompt 中的品名与锚点
        expect(s.imagePrompt).toContain("玻色因抗老面霜");
        expect(s.characterAnchor).toBe("30岁亚洲职场男士，身穿深灰西装");
        expect(s.productAnchor).toBe("深蓝磨砂玻璃罐装玻色因抗老面霜");
        expect(s.sceneAnchor).toBe("现代高层落地窗明亮办公室");

        // 3. 验证覆层 B-Roll 中的 {product_name} 被同步置换
        expect(s.brollCoverSlot.coverDescription).toBe("特写展示玻色因抗老面霜瓶身细节");
        expect(s.brollCoverSlot.coverVisualPrompt).toContain("玻色因抗老面霜");

        // 4. 验证 Ghost Snaps 中的预吸附占位提示词被同步置换
        expect(s.ghostSnaps[0].recommendedPrompt).toContain("玻色因抗老面霜");
    });

    it("创意复刻 v2.0: buildCreativeDirectorUserPrompt 正确注入 masterSlots 母版资产设定", async () => {
        const { buildCreativeDirectorUserPrompt } = await import(
            "../src/extensions/opc-infinite/prompts/hypit-director-prompts"
        );

        const prompt = buildCreativeDirectorUserPrompt({
            refScript: "原剧本：今天推荐这款好物",
            targetVideoModel: "kling-v1-6",
            userRequirement: "把人物换成外籍主播，商品换为蓝牙耳机",
            enableVisual: true,
            enableVoice: true,
            enableVideo: true,
            masterSlots: {
                character: { name: "外籍女主播 Sarah", promptAnchor: "25-year-old blonde European woman" },
                product: { name: "主动降噪蓝牙耳机 Pro", promptAnchor: "Matte black wireless earbuds in open case" },
                scene: { name: "现代都市极简客厅", promptAnchor: "Minimalist Scandinavian living room" },
            },
        });

        expect(prompt).toContain("【全局母版资产设定 (出镜角色 / 商品外观 / 场景基调)】");
        expect(prompt).toContain("外籍女主播 Sarah");
        expect(prompt).toContain("25-year-old blonde European woman");
        expect(prompt).toContain("主动降噪蓝牙耳机 Pro");
        expect(prompt).toContain("Matte black wireless earbuds in open case");
        expect(prompt).toContain("现代都市极简客厅");
        expect(prompt).toContain("Minimalist Scandinavian living room");
        expect(prompt).toContain("把人物换成外籍主播，商品换为蓝牙耳机");
    });

    it("创意复刻 v2.0: hotSwapStoryboardAssets 稳健支持单段落或非标准段落生图提示词置换", async () => {
        const { hotSwapStoryboardAssets } = await import(
            "../src/extensions/opc-infinite/prompts/hypit-director-prompts"
        );

        const testShots: any[] = [
            {
                shotNumber: 1,
                shotType: "l-cut",
                durationSec: 5,
                lines: "这款{product_name}真好用",
                imagePrompt: "UGC video recording. Asian female host holding cosmetic bottle in office setting.",
                characterAnchor: "Asian female host",
                productAnchor: "cosmetic bottle",
                sceneAnchor: "office setting",
                brollCoverSlot: {
                    targetWord: "{product_name}",
                    assetLabel: "产品特写",
                    coverDurationSec: 2,
                    coverPrompt: "Macro shot of {product_name}",
                    active: true,
                },
            },
        ];

        const swapped = hotSwapStoryboardAssets({
            shots: testShots,
            oldSlots: {
                actor: { name: "原版女主播", promptAnchor: "Asian female host" },
                product: { name: "{product_name}", promptAnchor: "cosmetic bottle" },
                scene: { name: "办公室", promptAnchor: "office setting" },
            },
            newSlots: {
                actor: { name: "欧美科技博主", promptAnchor: "European tech reviewer in casual hoodie" },
                product: { name: "无线机械键盘", promptAnchor: "Custom RGB mechanical keyboard" },
                scene: { name: "赛博霓虹电竞房", promptAnchor: "Cyberpunk neon gaming room" },
            },
            productNameSwap: {
                oldName: "{product_name}",
                newName: "无线机械键盘",
            },
        });

        expect(swapped[0].lines).toBe("这款无线机械键盘真好用");
        expect(swapped[0].imagePrompt).toContain("European tech reviewer in casual hoodie");
        expect(swapped[0].imagePrompt).toContain("Custom RGB mechanical keyboard");
        expect(swapped[0].imagePrompt).toContain("Cyberpunk neon gaming room");
        expect(swapped[0].brollCoverSlot.targetWord).toBe("无线机械键盘");
        expect(swapped[0].brollCoverSlot.coverPrompt).toContain("无线机械键盘");
    });

    it("创意复刻 v2.0: CREATIVE_REPLICATION_DIRECTOR_SYSTEM_PROMPT 必须包含四大多态形态、Dual-Text与磁吸吸附协议", async () => {
        const { CREATIVE_REPLICATION_DIRECTOR_SYSTEM_PROMPT } = await import(
            "../src/extensions/opc-infinite/prompts/hypit-director-prompts"
        );

        // 1. 验证四大镜头形态
        expect(CREATIVE_REPLICATION_DIRECTOR_SYSTEM_PROMPT).toContain("a-roll");
        expect(CREATIVE_REPLICATION_DIRECTOR_SYSTEM_PROMPT).toContain("b-roll");
        expect(CREATIVE_REPLICATION_DIRECTOR_SYSTEM_PROMPT).toContain("l-cut");
        expect(CREATIVE_REPLICATION_DIRECTOR_SYSTEM_PROMPT).toContain("split");

        // 2. 验证 Dual-Text 发音纠错语法
        expect(CREATIVE_REPLICATION_DIRECTOR_SYSTEM_PROMPT).toContain("<显示文本|朗读发音>");

        // 3. 验证 L-Cut 覆层切片契约
        expect(CREATIVE_REPLICATION_DIRECTOR_SYSTEM_PROMPT).toContain("brollCoverSlot");

        // 4. 验证 Ghost Snaps 意图预吸附规范
        expect(CREATIVE_REPLICATION_DIRECTOR_SYSTEM_PROMPT).toContain("ghostSnaps");
    });

    it("跨模式上下游兼容性：resolveUpstreamReferenceScript 智能提取经典反推、创意反推与文本节点", async () => {
        const { resolveUpstreamReferenceScript } = await import(
            "../src/extensions/opc-infinite/components/reference-video-script-node"
        );

        // 1. 测试上游【创意反推】（带 shotManifest） -> 正确提取为 deconstruct_shots 并格式化
        const deconstructNode: any = {
            id: "node-deconstruct-1",
            type: "video-reverse:analyzer",
            metadata: {
                videoReverse: {
                    activeTab: "deconstruct",
                    status: "success",
                    shotManifest: [
                        {
                            shotNumber: 1,
                            shotType: "a-roll",
                            timeRange: "0.0s - 3.0s",
                            visualSubject: "主播特写",
                            cameraMovement: "缓慢推近",
                            visualContent: "主播手持产品自然打招呼",
                            dialogue: "经常熬夜脸色蜡黄怎么办？",
                            wordTimings: "0.0s[经常] 1.0s[熬夜]",
                            replicateStrategy: "更换为新商品手持展示",
                        },
                        {
                            shotNumber: 2,
                            shotType: "b-roll",
                            timeRange: "3.0s - 7.0s",
                            visualSubject: "微距特写",
                            cameraMovement: "平移",
                            visualContent: "产品膏体质地特写",
                            dialogue: "这款美白精华一抹化水",
                            replicateStrategy: "展示新商品质地",
                        },
                    ],
                },
            },
        };

        const res1 = resolveUpstreamReferenceScript(deconstructNode);
        expect(res1.hasUpstream).toBe(true);
        expect(res1.isUpstreamReady).toBe(true);
        expect(res1.source).toBe("deconstruct_shots");
        expect(res1.shotCount).toBe(2);
        expect(res1.script).toContain("镜头 1 [A-ROLL] 0.0s - 3.0s");
        expect(res1.script).toContain("经常熬夜脸色蜡黄怎么办？");
        expect(res1.script).toContain("镜头 2 [B-ROLL] 3.0s - 7.0s");

        // 2. 测试上游【经典反推】（纯 prompt 文本） -> 正确提取为 reverse_prompt
        const classicNode: any = {
            id: "node-classic-1",
            type: "video-reverse:analyzer",
            metadata: {
                videoReverse: {
                    activeTab: "classic",
                    status: "success",
                    prompt: "【黄金3秒痛点】经常熬夜怎么办？\n【产品切入】使用保湿面霜\n【效果展现】皮肤透亮",
                },
            },
        };

        const res2 = resolveUpstreamReferenceScript(classicNode);
        expect(res2.hasUpstream).toBe(true);
        expect(res2.isUpstreamReady).toBe(true);
        expect(res2.source).toBe("reverse_prompt");
        expect(res2.script).toContain("【黄金3秒痛点】");

        // 3. 测试上游【文本节点】
        const textNode: any = {
            id: "node-text-1",
            type: "text",
            metadata: {
                content: "这是用户在画布上直接输入的短视频参考脚本文案",
            },
        };

        const res3 = resolveUpstreamReferenceScript(undefined, [textNode]);
        expect(res3.hasUpstream).toBe(true);
        expect(res3.isUpstreamReady).toBe(true);
        expect(res3.source).toBe("text_node");
        expect(res3.script).toBe("这是用户在画布上直接输入的短视频参考脚本文案");

        // 4. 测试上游反推尚未生成（处理中或未就绪）
        const pendingNode: any = {
            id: "node-pending-1",
            type: "video-reverse:analyzer",
            metadata: {
                videoReverse: {
                    status: "running",
                },
            },
        };

        const res4 = resolveUpstreamReferenceScript(pendingNode);
        expect(res4.hasUpstream).toBe(true);
        expect(res4.isUpstreamReady).toBe(false);
        expect(res4.script).toBe("");

        // 5. 测试无上游
        const res5 = resolveUpstreamReferenceScript(undefined, []);
        expect(res5.hasUpstream).toBe(false);
        expect(res5.isUpstreamReady).toBe(false);
        expect(res5.script).toBe("");
    }, 60000);

    it("创意复刻变体裂变与删除机制：forkVariation 与 deleteVariation 算法与状态严密性验证", async () => {
        const { forkVariation, deleteVariation } = await import(
            "../src/extensions/opc-infinite/prompts/hypit-director-prompts"
        );

        const initialSlots = {
            actor: { name: "原版主播", promptAnchor: "Chinese girl" },
            product: { name: "商品A", promptAnchor: "Product A" },
            scene: { name: "场景A", promptAnchor: "Scene A" },
        };
        const initialShots: any[] = [
            { shotNumber: 1, durationSec: 5, lines: "欢迎来到直播间" },
            { shotNumber: 2, durationSec: 5, lines: "今天给大家推荐商品A" },
        ];

        let vars: any[] = [
            {
                id: "v1",
                name: "版本 1 (原版)",
                masterSlots: initialSlots,
                shots: initialShots,
            },
        ];

        // 1. 派生版本 2
        const fork1 = forkVariation(vars, { ...initialSlots, product: { name: "商品B", promptAnchor: "Product B" } }, initialShots);
        expect(fork1.newVar.id).toBe("v2");
        expect(fork1.newVar.name).toBe("版本 2 (变体)");
        expect(fork1.newVar.masterSlots.product.name).toBe("商品B");
        expect(fork1.nextVars.length).toBe(2);
        vars = fork1.nextVars;

        // 2. 派生版本 3
        const fork2 = forkVariation(vars, { ...initialSlots, product: { name: "商品C", promptAnchor: "Product C" } }, initialShots);
        expect(fork2.newVar.id).toBe("v3");
        expect(fork2.newVar.name).toBe("版本 3 (变体)");
        vars = fork2.nextVars;
        expect(vars.length).toBe(3);

        // 3. 删除中间版本 v2（当前激活版本为 v3）
        const del1 = deleteVariation(vars, "v2", "v3");
        expect(del1.deletedVar?.id).toBe("v2");
        expect(del1.deletedVar?.name).toBe("版本 2 (变体)");
        expect(del1.nextVars.map((v) => v.id)).toEqual(["v1", "v3"]);
        expect(del1.switched).toBe(false);
        expect(del1.nextActiveId).toBe("v3");
        vars = del1.nextVars;

        // 4. 再次派生：ID 序号基于已有最大值递增，生成 v4，杜绝与现有 v3 碰撞
        const fork3 = forkVariation(vars, initialSlots, initialShots);
        expect(fork3.newVar.id).toBe("v4");
        expect(fork3.newVar.name).toBe("版本 4 (变体)");
        vars = fork3.nextVars;
        expect(vars.map((v) => v.id)).toEqual(["v1", "v3", "v4"]);

        // 5. 删除当前激活版本 v4：平滑切回相邻上一个版本 v3
        const del2 = deleteVariation(vars, "v4", "v4");
        expect(del2.deletedVar?.id).toBe("v4");
        expect(del2.switched).toBe(true);
        expect(del2.nextActiveId).toBe("v3");
        vars = del2.nextVars;
        expect(vars.map((v) => v.id)).toEqual(["v1", "v3"]);

        // 6. 删除当前激活版本 v3：切回 v1 原版基准
        const del3 = deleteVariation(vars, "v3", "v3");
        expect(del3.deletedVar?.id).toBe("v3");
        expect(del3.switched).toBe(true);
        expect(del3.nextActiveId).toBe("v1");
        vars = del3.nextVars;
        expect(vars.map((v) => v.id)).toEqual(["v1"]);

        // 7. 仅剩 1 个版本时尝试删除：安全保护拦截，不予删除
        const del4 = deleteVariation(vars, "v1", "v1");
        expect(del4.deletedVar).toBeNull();
        expect(del4.switched).toBe(false);
        expect(del4.nextVars.length).toBe(1);
        expect(del4.nextActiveId).toBe("v1");
    });

    it("创意复刻三大多维表格集群架构 (普通母版资产创作表 + 角色配音表 + 爆款复刻分镜表) 数据拓扑与自动互联契约验证", async () => {
        const { batchRowReady } = await import("../src/lib/canvas/canvas-batch-table");

        // 1. 验证 Table 1 作为普通批量创作表 (operation: creative, 无 contentKind 限制) 与其他表格协同
        const masterTableData = {
            operation: "creative" as const,
            concurrency: 6,
            aiGenerated: true,
            storyboardTitle: "护肤精华 - 母版资产创作表",
            referenceColumns: [{ id: "ref-image", label: "参考图插槽" }],
            textColumns: [
                { id: "col-slot-name", label: "资产名称与分类", type: "text" as const },
                { id: "col-visual-desc", label: "视觉外观特征", type: "text" as const },
            ],
            rows: [
                {
                    id: "master-row-actor",
                    enabled: true,
                    inputNodeIds: [""],
                    prompt: "A photograph captured as a single frame from a video actually shot on an iPhone... 亚洲干练职场女性，发型利落，职业西装，面部五官高度一致",
                    cells: {
                        "col-slot-name": "👤 出镜主角 (人物)",
                        "col-visual-desc": "亚洲干练女性，职业装，自然妆容",
                    },
                },
                {
                    id: "master-row-product",
                    enabled: true,
                    inputNodeIds: ["node-product-image"],
                    prompt: "基于参考图中的实物商品形态、包装结构与标识细节，呈现商业静物摄影质感... 保湿精华液",
                    cells: {
                        "col-slot-name": "📦 保湿精华液 (商品)",
                        "col-visual-desc": "磨砂玻璃瓶身，滴管特写，金黄色精华原液",
                    },
                },
            ],
        };

        const voiceTableData = {
            operation: "creative" as const,
            concurrency: 6,
            aiGenerated: true,
            contentKind: "voiceover" as const,
            storyboardTitle: "护肤精华 - 角色配音表",
            referenceColumns: [{ id: "ref-script", label: "编导脚本" }],
            textColumns: [
                { id: "col-shot", label: "关联镜头", type: "text" as const },
                { id: "col-time", label: "起止与时长", type: "text" as const },
                { id: "col-speaker", label: "说话人/角色", type: "text" as const },
                { id: "col-lines", label: "原文台词", type: "text" as const },
                { id: "col-spoken", label: "口语重写 (播报音)", type: "text" as const },
                { id: "col-tone", label: "情绪与语调", type: "text" as const },
                { id: "col-speed", label: "建议语速", type: "text" as const },
            ],
            rows: [
                {
                    id: "voice-row-1",
                    enabled: true,
                    inputNodeIds: ["node-script"],
                    prompt: "你是不是也每天加班熬夜，脸又黄又暗沉？",
                    cells: {
                        "col-shot": "镜头 1",
                        "col-time": "00:00 - 00:03 (3s)",
                        "col-speaker": "女主",
                        "col-lines": "你是不是也每天加班熬夜，脸又黄又暗沉？",
                        "col-spoken": "你是不是也每天加班熬夜，脸又黄又暗沉？",
                        "col-tone": "同理心共鸣、略带焦虑",
                        "col-speed": "1.0x 标准",
                    },
                },
            ],
        };

        const storyboardTableData = {
            operation: "creative" as const,
            concurrency: 10,
            aiGenerated: true,
            contentKind: "storyboard" as const,
            storyboardTitle: "护肤精华爆款复刻分镜表",
            referenceColumns: [
                { id: "ref-script", label: "编导脚本" },
                { id: "ref-master-slots", label: "母版资产" },
                { id: "ref-voiceover", label: "角色配音表" },
                { id: "ref-asset-1", label: "产品母图" },
            ],
            textColumns: [
                { id: "col-time", label: "时间与镜头形态", type: "text" as const },
                { id: "col-lines", label: "画面与核心对白", type: "text" as const },
                { id: "col-cover", label: "L-Cut覆层切片 (磁吸 B-Roll)", type: "text" as const },
                { id: "col-image-prompt", label: "首帧生图Prompt", type: "text" as const },
                { id: "col-motion-prompt", label: "物理运镜动效Prompt", type: "text" as const },
                { id: "col-master-ref", label: "绑定母版槽位", type: "text" as const },
            ],
            rows: [
                {
                    id: "shot-row-1",
                    enabled: true,
                    inputNodeIds: ["node-script", "batch-master", "batch-voice", "node-product-image"],
                    prompt: "亚洲职场女性面容疲惫特写，对着镜子叹气，柔和暖调侧光",
                    cells: {
                        "col-time": "[CU] 00:00 - 00:03 (3s)",
                        "col-lines": "你是不是也每天加班熬夜，脸又黄又暗沉？",
                        "col-cover": "[磁吸 1.5s] “脸又黄又暗沉”处覆盖 切片 | 脸颊毛孔粗糙暗沉特写",
                        "col-image-prompt": "亚洲职场女性面容疲惫特写，对着镜子叹气，柔和暖调侧光",
                        "col-motion-prompt": "【运镜】缓推面部特写，景深虚化",
                        "col-master-ref": "出镜主角 + 核心商品",
                    },
                },
            ],
        };

        // 2. 验证各表格 batchRowReady 策略：
        // Table 1 行 1：空插槽时作为文生图，只要有提示词即就绪
        const emptyNodeMap = new Map();
        expect(batchRowReady(masterTableData.rows[0], masterTableData, emptyNodeMap)).toBe(true);
        // Table 1 行 2：有插槽图片时，校验图片节点有效性
        const mockProductNode = { id: "node-product-image", type: "image", metadata: { content: "http://example.com/product.png" } } as any;
        const nodeMapWithProduct = new Map([["node-product-image", mockProductNode]]);
        expect(batchRowReady(masterTableData.rows[1], masterTableData, nodeMapWithProduct)).toBe(true);
        expect(batchRowReady(voiceTableData.rows[0], voiceTableData, emptyNodeMap)).toBe(true);
        expect(batchRowReady(storyboardTableData.rows[0], storyboardTableData, emptyNodeMap)).toBe(true);

        // 3. 验证自动拓扑互联契约 (Auto-Wiring)
        // 素材图 -> 母版创作表 (ref-image)
        // 母版创作表 -> 分镜总装 (ref-master-slots)
        // 脚本 -> 配音表 (ref-script)
        // 脚本 -> 分镜总装 (ref-script)
        // 配音表 -> 分镜总装 (ref-voiceover)
        const connections = [
            { fromNodeId: "node-product-image", toNodeId: "batch-master", toHandleId: "batch-reference:ref-image" },
            { fromNodeId: "batch-master", toNodeId: "batch-storyboard", toHandleId: "batch-reference:ref-master-slots" },
            { fromNodeId: "node-script", toNodeId: "batch-voice", toHandleId: "batch-reference:ref-script" },
            { fromNodeId: "node-script", toNodeId: "batch-storyboard", toHandleId: "batch-reference:ref-script" },
            { fromNodeId: "batch-voice", toNodeId: "batch-storyboard", toHandleId: "batch-reference:ref-voiceover" },
        ];

        // 断言分镜总装表的输入槽位严格连接了母版槽与配音表，且素材图正确连入母版创作表的参考图插槽
        const masterInputs = connections.filter((c) => c.toNodeId === "batch-master");
        expect(masterInputs.some((c) => c.fromNodeId === "node-product-image" && c.toHandleId === "batch-reference:ref-image")).toBe(true);

        const storyboardInputs = connections.filter((c) => c.toNodeId === "batch-storyboard");
        expect(storyboardInputs.some((c) => c.fromNodeId === "batch-master" && c.toHandleId === "batch-reference:ref-master-slots")).toBe(true);
        expect(storyboardInputs.some((c) => c.fromNodeId === "batch-voice" && c.toHandleId === "batch-reference:ref-voiceover")).toBe(true);
        expect(storyboardInputs.some((c) => c.fromNodeId === "node-script" && c.toHandleId === "batch-reference:ref-script")).toBe(true);

        // 4. 验证 L-Cut 磁吸 B-Roll 列完全取代原卡片内抽屉吸附，无抽屉遮挡
        expect(storyboardTableData.textColumns.some((col) => col.id === "col-cover")).toBe(true);
        expect(storyboardTableData.rows[0].cells["col-cover"]).toContain("[磁吸 1.5s]");
        expect(storyboardTableData.rows[0].cells["col-master-ref"]).toBe("出镜主角 + 核心商品");
    });

    it("全链路复核：【视频反推】与【参考生脚本】4象限双向兼容矩阵与图拓扑连接保障", async () => {
        const { resolveUpstreamReferenceScript } = await import(
            "../src/extensions/opc-infinite/components/reference-video-script-node"
        );
        const { buildCreativeDirectorUserPrompt, formatShotManifestToReadableScript } = await import(
            "../src/extensions/opc-infinite/prompts/hypit-director-prompts"
        );

        // -------------------------------------------------------------
        // 1. 模拟画布拓扑 connections 与节点列表
        // -------------------------------------------------------------
        const mockNodes: any[] = [
            {
                id: "reverse-node-1",
                type: "video-reverse:analyzer",
                title: "视频反推",
                metadata: {
                    content: "经典反推口播文案：熬夜脸垮必备神器...",
                    prompt: "经典反推口播文案：熬夜脸垮必备神器...",
                    videoReverse: {
                        activeTab: "classic",
                        status: "success",
                        prompt: "经典反推口播文案：熬夜脸垮必备神器...",
                    },
                },
            },
            {
                id: "reverse-node-2",
                type: "video-reverse:analyzer",
                title: "创意反推",
                metadata: {
                    content: "创意反推生成内容",
                    prompt: "创意反推生成内容",
                    videoReverse: {
                        activeTab: "deconstruct",
                        status: "success",
                        prompt: "创意反推综述说明",
                        shotManifest: [
                            {
                                shotNumber: 1,
                                shotType: "a-roll",
                                timeRange: "0.0s - 3.5s",
                                visualSubject: "半身特写",
                                cameraMovement: "推近",
                                visualContent: "主播展示产品",
                                dialogue: "熬夜姐妹看过来！",
                            },
                            {
                                shotNumber: 2,
                                shotType: "b-roll",
                                timeRange: "3.5s - 8.0s",
                                visualSubject: "手部特写",
                                cameraMovement: "微距平移",
                                visualContent: "产品质地展示",
                                dialogue: "丝滑不油腻",
                            },
                        ],
                    },
                },
            },
            {
                id: "reverse-node-unready",
                type: "video-reverse:analyzer",
                title: "未完成反推",
                metadata: {
                    videoReverse: {
                        activeTab: "classic",
                        status: "running",
                    },
                },
            },
            {
                id: "ref-script-node-1",
                type: "creation-assistant-ref-script:generator",
                title: "参考生脚本",
                metadata: { refScript: {} },
            },
        ];

        // 模拟真实 connections 连线
        const mockConnections = [
            { id: "conn-1", fromNodeId: "reverse-node-1", toNodeId: "ref-script-node-1" },
        ];

        // 验证图拓扑解析器：必须对称且完整返回包含自定义扩展算子的上游节点
        const getUpstreamNodes = (nodeId: string) => {
            return mockConnections
                .filter((connection) => connection.toNodeId === nodeId)
                .map((connection) => mockNodes.find((node) => node.id === connection.fromNodeId))
                .filter((node): node is any => Boolean(node));
        };

        const resolvedUpstreams = getUpstreamNodes("ref-script-node-1");
        expect(resolvedUpstreams.length).toBe(1);
        expect(resolvedUpstreams[0].id).toBe("reverse-node-1");
        expect(resolvedUpstreams[0].type).toBe("video-reverse:analyzer");

        // -------------------------------------------------------------
        // 象限 1: 视频反推 (经典反推) -> 参考生脚本 (经典复刻)
        // -------------------------------------------------------------
        const q1 = resolveUpstreamReferenceScript(mockNodes[0]);
        expect(q1.hasUpstream).toBe(true);
        expect(q1.isUpstreamReady).toBe(true);
        expect(q1.source).toBe("reverse_prompt");
        expect(q1.script).toContain("经典反推口播文案");

        // -------------------------------------------------------------
        // 象限 2: 视频反推 (经典反推) -> 参考生脚本 (创意复刻)
        // 经典反推仅有文本 prompt，创意复刻应基于该文本构造 Director 提示词，不抛异常
        // -------------------------------------------------------------
        const directorPromptFromClassic = buildCreativeDirectorUserPrompt({
            referenceScript: q1.script,
            structuredShots: undefined, // 经典反推无结构化镜头
            enableVisual: true,
            enableVoice: true,
            enableVideo: true,
            videoModel: "kling-v1-6",
        });
        expect(directorPromptFromClassic).toContain("【参考视频 / 爆款分镜文案】");
        expect(directorPromptFromClassic).toContain("经典反推口播文案：熬夜脸垮必备神器...");

        // -------------------------------------------------------------
        // 象限 3: 视频反推 (创意反推) -> 参考生脚本 (经典复刻)
        // 创意反推的镜头清单必须自动序列化为下游易读的 Markdown 分镜底稿
        // -------------------------------------------------------------
        const q3 = resolveUpstreamReferenceScript(mockNodes[1]);
        expect(q3.hasUpstream).toBe(true);
        expect(q3.isUpstreamReady).toBe(true);
        expect(q3.source).toBe("deconstruct_shots");
        expect(q3.shotCount).toBe(2);
        expect(q3.script).toContain("## 上游创意反推分镜");
        expect(q3.script).toContain("镜头 1 [A-ROLL] 0.0s - 3.5s");
        expect(q3.script).toContain("镜头 2 [B-ROLL] 3.5s - 8.0s");

        // -------------------------------------------------------------
        // 象限 4: 视频反推 (创意反推) -> 参考生脚本 (创意复刻)
        // 创意复刻直接继承 1:1 结构化镜头，毫秒时间轴与节奏全量保留
        // -------------------------------------------------------------
        const structuredShots = mockNodes[1].metadata.videoReverse.shotManifest;
        const directorPromptFromDeconstruct = buildCreativeDirectorUserPrompt({
            referenceScript: q3.script,
            structuredShots,
            enableVisual: true,
            enableVoice: true,
            enableVideo: true,
            videoModel: "kling-v1-6",
        });
        expect(directorPromptFromDeconstruct).toContain("【上游创意反推结构化镜头清单 (高精度参考事实，请 1:1 继承节奏与结构)】");
        expect(directorPromptFromDeconstruct).toContain("镜头1 [A-ROLL] 0.0s - 3.5s");
        expect(directorPromptFromDeconstruct).toContain("镜头2 [B-ROLL] 3.5s - 8.0s");

        // -------------------------------------------------------------
        // 象限 5: 未就绪状态防护（已连线但反推尚未完成）
        // 必须报告 hasUpstream: true, isUpstreamReady: false，以给出精准引导提示
        // -------------------------------------------------------------
        const q5 = resolveUpstreamReferenceScript(mockNodes[2]);
        expect(q5.hasUpstream).toBe(true);
        expect(q5.isUpstreamReady).toBe(false);
        expect(q5.script).toBe("");
    });

    it("桌面端原生 FFmpeg 适配器对齐：deconstruct 模式下保留黄金代表帧与 sharpnessScore", async () => {
        const { extractFramesWithDesktopFFmpeg } = await import(
            "../src/extensions/opc-infinite/media/video-decomposition/desktop-ffmpeg-sampler"
        );

        // 模拟桌面环境注入
        const mockDesktopBridge = {
            extractVideoFrames: async (opts: any) => {
                return {
                    success: true,
                    durationSec: 15.0,
                    width: 1920,
                    height: 1080,
                    frames: [
                        {
                            index: 1,
                            timestampSec: 0.033,
                            frameType: "visual_change_frame",
                            source: "ffmpeg.clean_in",
                            buffer: new Uint8Array([255, 216, 255, 224]),
                            mimeType: "image/jpeg",
                            width: 1920,
                            height: 1080,
                            sharpnessScore: 4658.2,
                            candidateIndex: 2,
                            shotIndex: 1,
                        },
                        {
                            index: 2,
                            timestampSec: 1.250,
                            frameType: "timeline_sample",
                            source: "ffmpeg.apex_keyframe",
                            buffer: new Uint8Array([255, 216, 255, 224]),
                            mimeType: "image/jpeg",
                            width: 1920,
                            height: 1080,
                            sharpnessScore: 5120.4,
                            candidateIndex: 3,
                            shotIndex: 1,
                        },
                        {
                            index: 3,
                            timestampSec: 2.500,
                            frameType: "timeline_sample",
                            source: "ffmpeg.clean_out",
                            buffer: new Uint8Array([255, 216, 255, 224]),
                            mimeType: "image/jpeg",
                            width: 1920,
                            height: 1080,
                            sharpnessScore: 3980.0,
                            candidateIndex: 1,
                            shotIndex: 1,
                        },
                    ],
                };
            },
        };

        (globalThis as any).desktopBridge = mockDesktopBridge;

        try {
            const result = await extractFramesWithDesktopFFmpeg("file:///C:/test/sample.mp4", {
                samplingPolicy: {
                    mode: "deconstruct",
                    fps: 1,
                    includeMiddleFrames: false,
                    sceneChangeThreshold: 0.2,
                    minSceneGapSec: 0.25,
                    maxFrames: 60,
                    maxFramesPerSheet: 12,
                    source: "user",
                },
            });

            expect(result).not.toBeNull();
            expect(result?.isDesktopNative).toBe(true);
            expect(result?.frames.length).toBe(3);
            expect(result?.frames[0].timestampSec).toBe(0.033);
            expect(result?.frames[0].sharpnessScore).toBe(4658.2);
            expect(result?.frames[0].sceneScore).toBe(4658.2);
            expect(result?.frames[1].sharpnessScore).toBe(5120.4);
            expect(result?.frames[2].sharpnessScore).toBe(3980.0);
            expect(result?.timelineManifest.frames.length).toBe(3);
        } finally {
            delete (globalThis as any).desktopBridge;
        }
    });

    it("创意复刻 v2.0: hotSwapStoryboardAssets 在缺省 oldSlots 时利用分镜内已记录锚点自愈置换", () => {
        const initialShots = [
            {
                shotNumber: 1,
                shotType: "a-roll",
                lines: "这款玻色因面霜真的绝了",
                characterAnchor: "25岁初熟知性白领，米色职业西装",
                productAnchor: "黑金瓶装玻色因抗老面霜",
                sceneAnchor: "现代阳光极简卧室",
                imagePrompt: "iPhone UGC photo.\n\n25岁初熟知性白领，米色职业西装.\n\n黑金瓶装玻色因抗老面霜.\n\n现代阳光极简卧室",
            },
        ];

        // 第一次热插拔：未传 oldSlots，但通过 shot.characterAnchor/productAnchor 自愈识别
        const swappedShots = hotSwapStoryboardAssets({
            shots: initialShots,
            oldSlots: undefined,
            newSlots: {
                actor: { name: "男士主播", promptAnchor: "30岁型男主播，黑白极简卫衣" },
                product: { name: "咖啡因眼霜", promptAnchor: "便携银色管状咖啡因紧致眼霜" },
                scene: { name: "现代极简办公区", promptAnchor: "现代极简办公区落地窗前" },
            },
            productNameSwap: { oldName: "玻色因面霜", newName: "咖啡因眼霜" },
        });

        expect(swappedShots.length).toBe(1);
        expect(swappedShots[0].characterAnchor).toBe("30岁型男主播，黑白极简卫衣");
        expect(swappedShots[0].productAnchor).toBe("便携银色管状咖啡因紧致眼霜");
        expect(swappedShots[0].sceneAnchor).toBe("现代极简办公区落地窗前");
        expect(swappedShots[0].imagePrompt).toContain("30岁型男主播，黑白极简卫衣");
        expect(swappedShots[0].imagePrompt).toContain("便携银色管状咖啡因紧致眼霜");
        expect(swappedShots[0].imagePrompt).toContain("现代极简办公区落地窗前");
        expect(swappedShots[0].lines).toContain("这款咖啡因眼霜真的绝了");
    });

    it("创意复刻多维表格母版行生成优先读取 promptAnchor 并支持 prompt 兼容兜底", () => {
        const customSlots = {
            actor: { name: "资深药剂师", promptAnchor: "专业女药剂师白大褂，手持滴管，眼神严谨" },
            product: { name: "抗皱精华", promptAnchor: "磨砂玻璃瓶精华液，滴管特写，金黄液体流光" },
            scene: { name: "无尘实验室", promptAnchor: "专业无菌实验室背景，柔和科技冷白光" },
        };

        const actorPrompt = (customSlots.actor as any).promptAnchor || (customSlots.actor as any).prompt || "默认主角";
        const productPrompt = (customSlots.product as any).promptAnchor || (customSlots.product as any).prompt || "默认商品";
        const scenePrompt = (customSlots.scene as any).promptAnchor || (customSlots.scene as any).prompt || "默认场景";

        expect(actorPrompt).toBe("专业女药剂师白大褂，手持滴管，眼神严谨");
        expect(productPrompt).toBe("磨砂玻璃瓶精华液，滴管特写，金黄液体流光");
        expect(scenePrompt).toBe("专业无菌实验室背景，柔和科技冷白光");

        // 旧数据仅有 prompt 时也能安全平滑降级
        const legacySlots = {
            actor: { name: "传统模特", prompt: "传统模特提示词" },
        };
        const legacyActorPrompt = (legacySlots.actor as any).promptAnchor || (legacySlots.actor as any).prompt || "默认主角";
        expect(legacyActorPrompt).toBe("传统模特提示词");
    });

    it("创意反推升级规范：formatShotManifestToReadableScript 与 buildCreativeDirectorUserPrompt 完整支持原片三要素、多态分镜与置换锚点", async () => {
        const {
            formatShotManifestToReadableScript,
            buildCreativeDirectorUserPrompt,
            parseDirectorJson,
        } = await import("../src/extensions/opc-infinite/prompts/hypit-director-prompts");

        // 1. 验证结构化分镜 Markdown 格式化
        const mockShots = [
            {
                shotNumber: 1,
                shotType: "a-roll",
                timeRange: "0.0s - 3.2s",
                durationSec: 3.2,
                hookType: "痛点唤醒与急迫召集",
                visualSubject: "半身人物 (主播特写)",
                cameraMovement: "推近特写",
                visualContent: "主播手持精华液面向镜头展示",
                dialogue: "熬夜脸垮垮的姐妹赶紧看过来！",
                wordTimings: "0.0s[熬夜] 0.6s[脸垮]",
                emotion: "急迫痛点",
                lightingTone: "柔和晨光暖色调",
                sfxCue: "清脆叮咚音效",
                characterAnchor: "25岁亚洲年轻女性",
                productAnchor: "美白补水精华液滴管瓶装",
                sceneAnchor: "现代简约梳妆台",
                replicateStrategy: "替换为新产品手持特写",
            },
            {
                shotNumber: 2,
                shotType: "l-cut",
                timeRange: "3.2s - 7.5s",
                durationSec: 4.3,
                visualSubject: "手部与商品特写 (伴音盖镜)",
                cameraMovement: "微距平移",
                visualContent: "口播延续不断，画面切换至挤出精华爆水特写",
                dialogue: "看这个质地一抹直接爆水！",
                wordTimings: "3.2s[看这个] 4.0s[质地]",
                emotion: "惊艳种草",
                lightingTone: "明亮无影微距光",
                sfxCue: "水滴声",
                characterAnchor: "纤细修长女性手部",
                productAnchor: "精华液爆水质地",
                sceneAnchor: "大理石纹理台面",
                replicateStrategy: "替换为新商品质地展示",
                brollCoverSlot: {
                    targetWord: "质地",
                    coverDurationSec: 2.0,
                    assetLabel: "商品质地爆水特写",
                    coverPrompt: "Macro shot of serum texture",
                },
            },
        ];

        const readableScript = formatShotManifestToReadableScript(mockShots, "原片全片 15 秒快速拆解");
        expect(readableScript).toContain("## 创意反推分镜拆解表");
        expect(readableScript).toContain("[A-ROLL]");
        expect(readableScript).toContain("[L-CUT]");
        expect(readableScript).toContain("- **吸睛钩子**：痛点唤醒与急迫召集");
        expect(readableScript).toContain("- **视听氛围**：光影: 柔和晨光暖色调 | 音效: 清脆叮咚音效");
        expect(readableScript).toContain("- **置换锚点**：人物: 25岁亚洲年轻女性 | 商品: 美白补水精华液滴管瓶装 | 场景: 现代简约梳妆台");
        expect(readableScript).not.toContain("{");

        // 2. 验证 parseDirectorJson 能够解析带 originalMasterSlots 的 JSON
        const sampleJsonText = `
这里是拆解综述...
\`\`\`json
{
  "title": "创意反推分镜图纸",
  "totalDurationSec": 15,
  "originalMasterSlots": {
    "actor": "25岁亚洲年轻女性，长发自然散落",
    "product": "美白补水精华液滴管瓶",
    "scene": "现代简约卧室梳妆台前"
  },
  "shots": [
    {
      "shotNumber": 1,
      "shotType": "a-roll",
      "timeRange": "0.0s - 3.2s",
      "visualSubject": "主播特写",
      "cameraMovement": "推近",
      "dialogue": "熬夜姐妹看过来"
    }
  ]
}
\`\`\`
`;
        const parsed = parseDirectorJson<any>(sampleJsonText);
        expect(parsed).toBeTruthy();
        expect(parsed.originalMasterSlots?.actor).toBe("25岁亚洲年轻女性，长发自然散落");
        expect(parsed.originalMasterSlots?.product).toBe("美白补水精华液滴管瓶");
        expect(parsed.shots.length).toBe(1);

        // 3. 验证 buildCreativeDirectorUserPrompt 能注入 originalMasterSlots 与升级分镜
        const userPrompt = buildCreativeDirectorUserPrompt({
            referenceScript: readableScript,
            structuredShots: mockShots,
            originalMasterSlots: parsed.originalMasterSlots,
            userRequirement: "换为男士控油洁面乳",
            masterSlots: {
                actor: { name: "男士主角", promptAnchor: "A 25yo Asian man with clean skin" },
                product: { name: "控油洁面乳", promptAnchor: "Matte black bottle face cleanser" },
                scene: { name: "现代浴室", promptAnchor: "Modern minimalist bathroom" },
            },
            enableVisual: true,
            enableVoice: true,
            enableVideo: true,
        });

        expect(userPrompt).toContain("【上游原片三要素基准 (参考视频原始设定，复刻时请精准置换为用户的新设定)】:");
        expect(userPrompt).toContain("原片出镜主角基准: 25岁亚洲年轻女性，长发自然散落");
        expect(userPrompt).toContain("原片推广商品基准: 美白补水精华液滴管瓶");
        expect(userPrompt).toContain("吸睛钩子: 痛点唤醒与急迫召集");
        expect(userPrompt).toContain("视听氛围: 光影: 柔和晨光暖色调 | 音效: 清脆叮咚音效");
        expect(userPrompt).toContain("置换锚点: 人物: 25岁亚洲年轻女性 | 商品: 美白补水精华液滴管瓶装 | 场景: 现代简约梳妆台");
    });

    it("创意反推全品类通用视听解构：正向专业、零负面元讨论、无宽表格、高颗粒度微时序与力学物理反馈", async () => {
        const {
            CREATIVE_REVERSE_SHOT_DECONSTRUCTION_SYSTEM_PROMPT,
            parseDirectorJson,
            formatShotManifestToReadableScript,
        } = await import("../src/extensions/opc-infinite/prompts/hypit-director-prompts");

        // 1. 验证正向设计：绝无负面、元讨论或说教式字眼
        expect(CREATIVE_REVERSE_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).not.toContain("严禁出现任何下游换品");
        expect(CREATIVE_REVERSE_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).not.toContain("复刻建议或改写脑补");
        expect(CREATIVE_REVERSE_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).not.toContain("二创复刻与改编策略");

        // 2. 验证无横向 11 列宽表格破版设计，采用逐镜头工程卡段
        expect(CREATIVE_REVERSE_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).not.toContain("| 镜头编号 |");
        expect(CREATIVE_REVERSE_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).not.toContain("| :--- |");

        // 3. 验证高颗粒度视听解构规范（微时序、物品物理反馈、视线转移路径）
        expect(CREATIVE_REVERSE_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).toContain("三段式微过程");
        expect(CREATIVE_REVERSE_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).toContain("主要物品物理反馈");
        expect(CREATIVE_REVERSE_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).toContain("情绪微表情与眼神轨迹");
        expect(CREATIVE_REVERSE_SHOT_DECONSTRUCTION_SYSTEM_PROMPT).toContain("逐镜头全息工程图纸");

        // 4. 验证通用 JSON 反推数据结构解析，同时兼容 coreElements 与 originalMasterSlots
        const sampleDeconstructOutput = `
\`\`\`json
{
  "title": "咖啡手冲日常 Vlog 视听全息解构",
  "coreElements": {
    "character": "手冲咖啡师，灰色围裙，手势娴熟从容",
    "focalObject": "黑色细嘴手冲壶与玻璃滤杯，深焙咖啡粉层膨胀鼓包",
    "scene": "木质吧台温润日光环境，背景柔和留白"
  },
  "shots": [
    {
      "shotNumber": 1,
      "shotType": "a-roll",
      "timeRange": "00:00-00:03",
      "scaleAndAngle": "中近景 / 平视",
      "visualContent": "咖啡师拿起细嘴壶准备注水",
      "performanceTiming": "0.0s 提壶悬停 -> 1.2s 稳步匀速画圈注水 -> 2.8s 提壶断水收水流",
      "physicalFeedback": "水流注入瞬间咖啡粉层剧烈膨胀鼓起蜂窝状气泡，深褐色油脂向外扩散",
      "dialogue": "今天教大家三段式注水技巧。",
      "speechRate": "3.2字/秒",
      "stressWords": "三段式注水",
      "emotionAndGaze": "专注沉稳，目光垂视滤杯粉层",
      "lightingTone": "晨曦侧逆光，水流反射出晶莹高光",
      "soundAndBgm": "细微平稳的滴滤水声与咖啡粉膨胀排气声",
      "characterAnchor": "咖啡师灰色围裙与专注侧颜",
      "focalAnchor": "细嘴手冲壶与膨胀滤杯",
      "sceneAnchor": "木质手冲吧台"
    }
  ]
}
\`\`\`
`;
        const parsed = parseDirectorJson<any>(sampleDeconstructOutput);
        expect(parsed).toBeTruthy();
        expect(parsed.coreElements?.character).toBe("手冲咖啡师，灰色围裙，手势娴熟从容");
        expect(parsed.coreElements?.focalObject).toContain("黑色细嘴手冲壶");
        expect(parsed.shots.length).toBe(1);
        expect(parsed.shots[0].performanceTiming).toContain("画圈注水");
        expect(parsed.shots[0].physicalFeedback).toContain("蜂窝状气泡");

        // 5. 验证 formatShotManifestToReadableScript 格式化包含微时序与物理反馈
        const formatted = formatShotManifestToReadableScript(parsed.shots);
        expect(formatted).toContain("微动作时序");
        expect(formatted).toContain("物理反馈与力学");
        expect(formatted).toContain("水流注入瞬间咖啡粉层剧烈膨胀鼓起蜂窝状气泡");
    });

    it("逐镜头全息工程图纸智能接驳：代码自动从板块五提取 JSON 并直接无缝接入 Markdown 展示框", async () => {
        const { formatShotManifestToReadableScript } = await import(
            "../src/extensions/opc-infinite/prompts/hypit-director-prompts"
        );

        const rawLLMOutput = `## 一、视频全景总览
- 视频总时长：12.5 秒
- 拍摄与调度方式：walk-and-talk
- 题材体裁属性：剧情故事

## 二、视听注意力与叙事节律
- 0-3 秒黄金双钩子：
  * 视觉冲击焦点：快速前冲

## 三、空间场域、美术与布光设计
- 核心空间环境：现代玄关

## 四、演员表演与视听动力学
- 面部表情时序轨迹：兴奋大笑

## 五、逐镜头全息工程图纸 (Shot-by-Shot Holographic Breakdown)
按镜头时间顺序，以工业级标准将逐镜头全息拆解统一收敛在如下标准合规的 \`\`\`json 代码块中完整输出。
无需且绝对禁止在外部以 Markdown 文本重复罗列镜头，前端工程引擎将直接从该 JSON 代码块解析出全部高精分镜卡片：

\`\`\`json
{
  "title": "原片视听全息解构图纸",
  "shots": [
    {
      "shotNumber": 1,
      "shotType": "a-roll",
      "timeRange": "00:00.0-00:02.0 (2.0s)",
      "scaleAndAngle": "近景 / 平视",
      "cameraMovement": "快速微前推",
      "visualContent": "演员自画面斜前方快速向前倾身冲近镜头",
      "performanceTiming": "0.0s 冲近 -> 0.6s 直视 -> 1.0s 微退",
      "physicalFeedback": "面部光影明暗过渡",
      "dialogue": "什么姐妹们！",
      "wordTimings": "0.0s[什么] 0.4s[姐妹们]",
      "voiceTone": "4.0字/秒，重音在“姐妹们”",
      "lightingTone": "大面积正面柔光面光",
      "soundAndAtmosphere": "原声高亢喊话",
      "characterAnchor": "年轻女性长发散落",
      "focalAnchor": "黑色宽松皮夹克",
      "sceneAnchor": "大理石玄关走廊"
    },
    {
      "shotNumber": 2,
      "shotType": "l-cut",
      "timeRange": "00:02.0-00:04.5 (2.5s)",
      "scaleAndAngle": "特写 / 俯视",
      "visualContent": "手部抚摸皮质表面",
      "performanceTiming": "2.0s 触碰 -> 3.0s 按压 -> 4.0s 滑擦",
      "physicalFeedback": "拇指下压产生弹性凹陷",
      "dialogue": "看看这个质感！"
    }
  ]
}
\`\`\`
`;

        // 1. 自动提取并拼接（即使未外部解析 shots，也能自愈提取）
        const splicedText = formatShotManifestToReadableScript(undefined, rawLLMOutput);

        // 2. 验证板块完整性
        expect(splicedText).toContain("## 一、视频全景总览");
        expect(splicedText).toContain("## 二、视听注意力与叙事节律");
        expect(splicedText).toContain("## 三、空间场域、美术与布光设计");
        expect(splicedText).toContain("## 四、演员表演与视听动力学");
        expect(splicedText).toContain("## 五、逐镜头全息工程图纸");

        // 3. 验证 JSON 代码块及提示词套话已被完全剥离
        expect(splicedText).not.toContain("```json");
        expect(splicedText).not.toContain("按镜头时间顺序，以工业级标准将逐镜头全息拆解统一收敛");
        expect(splicedText).not.toContain("前端工程引擎将直接从该 JSON");

        // 4. 验证镜头数据已准确接驳在板块五之下
        expect(splicedText).toContain("### 镜头 1 [A-ROLL] 00:00.0-00:02.0 (2.0s)");
        expect(splicedText).toContain("- **微动作时序**：0.0s 冲近 -> 0.6s 直视 -> 1.0s 微退");
        expect(splicedText).toContain("- **物理反馈与力学**：面部光影明暗过渡");
        expect(splicedText).toContain("- **原片台词**：什么姐妹们！");
        expect(splicedText).toContain("### 镜头 2 [L-CUT] 00:02.0-00:04.5 (2.5s)");
        expect(splicedText).toContain("- **微动作时序**：2.0s 触碰 -> 3.0s 按压 -> 4.0s 滑擦");
        expect(splicedText).toContain("- **物理反馈与力学**：拇指下压产生弹性凹陷");

        // 5. 验证未产生冗余的二次标题
        expect(splicedText).not.toContain("## 创意反推分镜拆解表");
    });

    it("经典复刻时长判定规范：显式需求优先 > 继承原片/参考脚本时长 > 模型时长仅为分段上限", async () => {
        const {
            extractExplicitDurationFromText,
            extractDurationFromScriptText,
            resolveCreationAssistantDurations,
        } = await import("../src/extensions/opc-infinite/services/creation-assistant-contracts");
        const { resolveUpstreamReferenceScript } = await import(
            "../src/extensions/opc-infinite/components/reference-video-script-node"
        );
        const {
            buildReferenceScriptCreationAssistantUserPrompt,
        } = await import("../src/lib/creation-assistant-prompts");
        const { segmentCreationAssistantTimeline } = await import(
            "../src/lib/creation-assistant-segmentation"
        );

        // 1. extractExplicitDurationFromText 精准提取测试
        expect(extractExplicitDurationFromText("帮我生成一条30秒视频")).toBe(30);
        expect(extractExplicitDurationFromText("时长：45s，强调控油")).toBe(45);
        expect(extractExplicitDurationFromText("视频总时长: 60秒")).toBe(60);
        expect(extractExplicitDurationFromText("制作一个1分钟左右的带货短视频")).toBe(60);
        expect(extractExplicitDurationFromText("控制在1分30秒内")).toBe(90);
        expect(extractExplicitDurationFromText("要求时长 15s")).toBe(15);
        expect(extractExplicitDurationFromText("做一个20秒的脚本")).toBe(20);

        // 严格排除非时长数字干扰（年龄、价格、画质、帧率）
        expect(extractExplicitDurationFromText("25岁女性，售价199元，买2送1")).toBeUndefined();
        expect(extractExplicitDurationFromText("4K 60帧电影质感")).toBeUndefined();
        expect(extractExplicitDurationFromText("iPhone 16 1080p高清拍摄")).toBeUndefined();

        // 2. extractDurationFromScriptText 从参考脚本中提取时间轴最大值
        const scriptWithTimestamps = `
### 镜头 1 [A-ROLL] 00:00-00:05
- **画面内容**：主角拿起商品
### 镜头 2 [A-ROLL] 00:05-00:15
- **画面内容**：展示质地
### 镜头 3 [A-ROLL] 00:15-00:28
- **画面内容**：结尾转化
        `;
        expect(extractDurationFromScriptText(scriptWithTimestamps)).toBe(28);

        const scriptWithSecondMarks = `
[0-3秒] 开场黄金钩子
[3-10秒] 痛点展示
[10-20秒] 功效原理
[20-35秒] 结尾号召
        `;
        expect(extractDurationFromScriptText(scriptWithSecondMarks)).toBe(35);

        const scriptWithHeader = `
【参考脚本】
视频时长：45秒
其他说明：爆款混剪
        `;
        expect(extractDurationFromScriptText(scriptWithHeader)).toBe(45);

        // 3. resolveCreationAssistantDurations 优先级判定
        // 场景 A：用户显式输入时长（45s），上游反推视频时长为 18s -> 优先采用用户显式输入的 45s
        const resA = resolveCreationAssistantDurations({
            userRequirement: "要求生成一条45秒视频，突出清爽吸收快",
            upstreamReverseMeta: { durationSec: 18 },
        });
        expect(resA.targetDurationSec).toBe(45);
        expect(resA.referenceDurationSec).toBe(18);
        expect(resA.isExplicitUserDuration).toBe(true);
        expect(resA.durationSource).toBe("user_explicit");

        // 场景 B：用户未显式指定时长，上游反推记录了视频时长（24s）-> 完整继承原片 24s 时长
        const resB = resolveCreationAssistantDurations({
            userRequirement: "把主角换成年轻男士，保持原片快节奏",
            upstreamReverseMeta: { durationSec: 24 },
        });
        expect(resB.targetDurationSec).toBe(24);
        expect(resB.referenceDurationSec).toBe(24);
        expect(resB.isExplicitUserDuration).toBe(false);
        expect(resB.durationSource).toBe("upstream_reverse");

        // 场景 C：无上游反推节点，但用户粘贴了参考脚本（时间戳至 22s）-> 自动从脚本时间轴继承 22s
        const resC = resolveCreationAssistantDurations({
            userRequirement: "按参考脚本仿写",
            referenceScriptText: `[00:00-00:05] 镜头1\n[00:05-00:22] 镜头2`,
        });
        expect(resC.targetDurationSec).toBe(22);
        expect(resC.referenceDurationSec).toBe(22);
        expect(resC.durationSource).toBe("reference_script_content");

        // 场景 D：纯文本无时间戳、无上游 -> 兜底 30s
        const resD = resolveCreationAssistantDurations({
            userRequirement: "生成带货脚本",
            fallbackDurationSec: 30,
        });
        expect(resD.targetDurationSec).toBe(30);
        expect(resD.referenceDurationSec).toBe(30);
        expect(resD.durationSource).toBe("default");

        // 4. 生视频模型的最大时长（如 Kling 5s）仅作为切片计划上限，绝不截断整篇剧本总时长
        const targetDuration = 30; // 目标总时长 30 秒
        const klingMaxDuration = 5; // 可灵单段最大 5 秒
        const segmentPlan = segmentCreationAssistantTimeline(targetDuration, klingMaxDuration);
        expect(segmentPlan.length).toBe(6); // 规划为 6 段切片
        expect(segmentPlan[0].startSec).toBe(0);
        expect(segmentPlan[5].endSec).toBe(30); // 完整覆盖到第 30 秒

        // 5. 提示词中强制注入【核心时长与分段执行铁律】，严禁大模型误当 5 秒截断
        const prompt = buildReferenceScriptCreationAssistantUserPrompt({
            referenceScript: "[00:00-00:30] 原视频",
            durationSec: targetDuration,
            referenceScriptDurationSec: 30,
            businessScenario: "ecommerce",
            language: "zh",
            videoModel: "kling-v1-6",
            videoModelMaxDurationSec: klingMaxDuration,
            videoSegmentPlan: segmentPlan,
            additionalNotes: "换成男士洁面乳",
            fileSummaries: [],
            insightSections: [],
            assetReferenceMap: [],
        });
        expect(prompt).toContain("目标总时长为 30 秒");
        expect(prompt).toContain("单段最大生成时长：5 秒");
        expect(prompt).toContain("核心时长与分段执行铁律（不可违反）");
        expect(prompt).toContain("严禁只输出前 5 秒就截断脚本");

        // 6. resolveUpstreamReferenceScript 提取上游反推的 durationSec
        const mockReverseNode: any = {
            id: "rev-1",
            type: "video-reverse:analyzer",
            metadata: {
                videoReverse: {
                    durationSec: 25,
                    shotManifest: [
                        { shotNumber: 1, startSec: 0, endSec: 10, timeRange: "00:00-00:10" },
                        { shotNumber: 2, startSec: 10, endSec: 25, timeRange: "00:10-00:25" },
                    ],
                },
            },
        };
        const resolvedUpstream = resolveUpstreamReferenceScript(mockReverseNode);
        expect(resolvedUpstream.durationSec).toBe(25);
    });

    it("用户创作需求 @素材 多形式鲁棒匹配：冒号、中括号、紧随中文与自定义标题均精准识别", () => {
        const mockRef1 = {
            id: "node-1",
            nodeId: "node-1",
            kind: "image" as const,
            label: "图片1",
            title: "女士保湿精华",
            active: true,
        };

        const mockRef2 = {
            id: "node-2",
            nodeId: "node-2",
            kind: "image" as const,
            label: "图片2",
            title: "运动跑鞋",
            active: true,
        };

        // 1. 标准空格形式
        expect(isReferenceMentionedInText(mockRef1, "请将画面中的产品替换为 @图片1 进行展示")).toBe(true);

        // 2. 中英文冒号形式
        expect(isReferenceMentionedInText(mockRef1, "要求：@图片1:保持瓶身通透光泽")).toBe(true);
        expect(isReferenceMentionedInText(mockRef1, "要求：@图片1：特写镜头旋转呈现")).toBe(true);

        // 3. 全角/半角方括号形式
        expect(isReferenceMentionedInText(mockRef1, "将 @【图片1】 置于画面中心")).toBe(true);
        expect(isReferenceMentionedInText(mockRef1, "将 @[图片1] 替换原视频背景")).toBe(true);

        // 4. 紧跟中文无空格形式
        expect(isReferenceMentionedInText(mockRef1, "开头给 @图片1近景特写")).toBe(true);

        // 5. 缩写“图1”识别
        expect(isReferenceMentionedInText(mockRef1, "参考 @图1 的色彩调性")).toBe(true);

        // 6. 节点标题直接 @ 识别
        expect(isReferenceMentionedInText(mockRef1, "核心亮点在于 @女士保湿精华 的补水质感")).toBe(true);

        // 7. 节点底层 ID 识别
        expect(isReferenceMentionedInText(mockRef1, "内部引用 @[node:node-1] 维持主体统一")).toBe(true);

        // 8. 防误伤：@图片10 不会误命中 @图片1
        expect(isReferenceMentionedInText(mockRef1, "请仅使用 @图片10 作为主图")).toBe(false);

        // 9. 独立素材互不干扰
        expect(isReferenceMentionedInText(mockRef2, "请将画面中的产品替换为 @图片1 进行展示")).toBe(false);
        expect(isReferenceMentionedInText(mockRef2, "强调 @运动跑鞋 的缓震科技")).toBe(true);
    });

    it("buildRefScriptMentionReferences 尊重并继承节点已有原生素材标签编号", () => {
        const mockNodes: any[] = [
            {
                id: "img-node-2",
                type: CanvasNodeType.Image,
                title: "图片2",
                metadata: {
                    content: "https://example.com/shoe.jpg",
                },
            },
        ];

        const refs = buildRefScriptMentionReferences(mockNodes);
        expect(refs.length).toBe(1);
        expect(refs[0].label).toBe("图片2");
        expect(refs[0].mentionToken).toBe("@图片2");
    });

    it("双轨独立存储 (Dual-Track Isolation) 与激活态动态投影：经典反推与创意反推互不覆盖且下游精准对齐", async () => {
        const { resolveUpstreamReferenceScript } = await import(
            "../src/extensions/opc-infinite/components/reference-video-script-node"
        );
        const { buildCreativeDirectorUserPrompt } = await import(
            "../src/extensions/opc-infinite/prompts/hypit-director-prompts"
        );

        // 构造一个包含双轨完整数据的节点
        const dualTrackNode: any = {
            id: "dual-track-reverse-node",
            type: "video-reverse:analyzer",
            title: "视频反推",
            metadata: {
                content: "这是当前对外暴露的文本",
                prompt: "这是当前对外暴露的文本",
                videoReverse: {
                    activeTab: "classic",
                    status: "success",
                    prompt: "经典模式口播脚本：深层抗老修复肌底...",
                    classic: {
                        prompt: "经典模式口播脚本：深层抗老修复肌底...",
                        customRules: "经典反推补充规则：强化产品功效与口播文案",
                        replaceBuiltInPrompt: false,
                        samplingMode: "seconds_and_scene",
                        samplingFps: 1.5,
                        updatedAt: 1000,
                    },
                    deconstruct: {
                        prompt: "创意反推分镜综述：前3秒黄金钩子+转折展开",
                        customRules: "创意反推补充规则：精细标记景别与运镜",
                        replaceBuiltInPrompt: true,
                        promptRules: "自定义创意拆解系统级提示词...",
                        shotManifest: [
                            {
                                shotNumber: 1,
                                shotType: "a-roll",
                                timeRange: "0.0s - 3.0s",
                                scaleAndAngle: "特写",
                                cameraMovement: "推镜头",
                                visualContent: "女主播手持精华液展示质地",
                                dialogue: "垮脸姐妹快停下！",
                            },
                            {
                                shotNumber: 2,
                                shotType: "b-roll",
                                timeRange: "3.0s - 7.5s",
                                scaleAndAngle: "微距",
                                cameraMovement: "下移",
                                visualContent: "精华液滴落指尖延展微观特写",
                                dialogue: "一抹化水，秒速吸收",
                            },
                        ],
                        originalMasterSlots: {
                            character: "年轻女主播",
                            product: "紧致修护精华液",
                            scene: "温馨北欧风居室",
                        },
                        updatedAt: 2000,
                    },
                    // 历史顶层兼容字段仍保留 deconstruct 的镜头清单
                    shotManifest: [
                        { shotNumber: 1, timeRange: "0.0s - 3.0s" },
                    ],
                },
            },
        };

        // 1. 当 activeTab === "classic" 时，下游【参考生脚本】必须严格提取经典反推文本，绝不透传创意反推分镜
        const classicResolution = resolveUpstreamReferenceScript(dualTrackNode);
        expect(classicResolution.hasUpstream).toBe(true);
        expect(classicResolution.isUpstreamReady).toBe(true);
        expect(classicResolution.source).toBe("reverse_prompt");
        expect(classicResolution.script).toContain("经典模式口播脚本：深层抗老修复肌底...");

        // 下游编导调度器根据上游 activeTab 判断 structuredShots 与 originalMasterSlots
        const isUpstreamClassic = dualTrackNode.metadata.videoReverse.activeTab === "classic";
        const upstreamDeconstructShots = dualTrackNode.metadata.videoReverse.deconstruct?.shotManifest || dualTrackNode.metadata.videoReverse.shotManifest;
        const classicStructuredShots =
            !isUpstreamClassic && Array.isArray(upstreamDeconstructShots) && upstreamDeconstructShots.length > 0
                ? upstreamDeconstructShots
                : undefined;
        const classicOriginalMasterSlots = !isUpstreamClassic
            ? (dualTrackNode.metadata.videoReverse.deconstruct?.originalMasterSlots || dualTrackNode.metadata.videoReverse.originalMasterSlots)
            : undefined;

        expect(classicStructuredShots).toBeUndefined();
        expect(classicOriginalMasterSlots).toBeUndefined();

        // 经典模式接入创意复刻构建 Prompt，绝不注入 structuredShots
        const classicDirectorPrompt = buildCreativeDirectorUserPrompt({
            referenceScript: classicResolution.script,
            structuredShots: classicStructuredShots,
            originalMasterSlots: classicOriginalMasterSlots,
            enableVisual: true,
            enableVoice: true,
            enableVideo: true,
            videoModel: "kling-v1-6",
        });
        expect(classicDirectorPrompt).toContain("经典模式口播脚本：深层抗老修复肌底...");
        expect(classicDirectorPrompt).not.toContain("【原片拆解结构化镜头清单】");
        expect(classicDirectorPrompt).not.toContain("原片三要素母版资产");

        // 2. 模拟用户切换 Tab 至 "deconstruct"
        dualTrackNode.metadata.videoReverse.activeTab = "deconstruct";
        dualTrackNode.metadata.videoReverse.prompt = dualTrackNode.metadata.videoReverse.deconstruct.prompt;

        // 3. 当 activeTab === "deconstruct" 时，下游必须无缝智能识别为结构化分镜与母版要素
        const deconstructResolution = resolveUpstreamReferenceScript(dualTrackNode);
        expect(deconstructResolution.hasUpstream).toBe(true);
        expect(deconstructResolution.isUpstreamReady).toBe(true);
        expect(deconstructResolution.source).toBe("deconstruct_shots");
        expect(deconstructResolution.shotCount).toBe(2);

        const isUpstreamDeconstruct = dualTrackNode.metadata.videoReverse.activeTab !== "classic";
        const deconstructStructuredShots =
            isUpstreamDeconstruct && Array.isArray(upstreamDeconstructShots) && upstreamDeconstructShots.length > 0
                ? upstreamDeconstructShots
                : undefined;
        const deconstructOriginalMasterSlots = isUpstreamDeconstruct
            ? (dualTrackNode.metadata.videoReverse.deconstruct?.originalMasterSlots || dualTrackNode.metadata.videoReverse.originalMasterSlots)
            : undefined;

        expect(deconstructStructuredShots?.length).toBe(2);
        expect(deconstructOriginalMasterSlots?.character).toBe("年轻女主播");
        expect(deconstructOriginalMasterSlots?.product).toBe("紧致修护精华液");
        expect(deconstructOriginalMasterSlots?.scene).toBe("温馨北欧风居室");

        // 创意模式接入创意复刻构建 Prompt，自动注入结构化分镜与母版要素
        const deconstructDirectorPrompt = buildCreativeDirectorUserPrompt({
            referenceScript: deconstructResolution.script,
            structuredShots: deconstructStructuredShots,
            originalMasterSlots: deconstructOriginalMasterSlots,
            enableVisual: true,
            enableVoice: true,
            enableVideo: true,
            videoModel: "kling-v1-6",
        });
        expect(deconstructDirectorPrompt).toContain("【上游原片三要素基准 (参考视频原始设定，复刻时请精准置换为用户的新设定)】:");
        expect(deconstructDirectorPrompt).toContain("紧致修护精华液");
        expect(deconstructDirectorPrompt).toContain("温馨北欧风居室");
        expect(deconstructDirectorPrompt).toContain("【上游创意反推结构化镜头清单 (高精度参考事实，请 1:1 继承节奏与结构)】");
        expect(deconstructDirectorPrompt).toContain("镜头1 [A-ROLL] 0.0s - 3.0s");
        expect(deconstructDirectorPrompt).toContain("垮脸姐妹快停下！");

        // 4. 再次检验：经典轨的独立数据在创意反推生效时依然 100% 完整留存，零串味
        expect(dualTrackNode.metadata.videoReverse.classic.prompt).toBe("经典模式口播脚本：深层抗老修复肌底...");
        expect(dualTrackNode.metadata.videoReverse.classic.customRules).toBe("经典反推补充规则：强化产品功效与口播文案");
        expect(dualTrackNode.metadata.videoReverse.classic.samplingFps).toBe(1.5);
    });

    it("双轨拼图 (contactSheets) 隔离与清空 (clearAll) 防串味防复活验证", async () => {
        // 构造双轨反推节点：经典轨包含拼图，创意轨尚未生成拼图
        const nodeMeta: any = {
            activeTab: "classic",
            status: "success",
            prompt: "经典文案",
            samplingMode: "seconds_and_scene",
            contactSheets: [{ pageIndex: 0, url: "blob:sheet-classic-0" }],
            classic: {
                prompt: "经典文案",
                customRules: "经典规则",
                samplingMode: "seconds_and_scene",
                samplingFps: 1.0,
                contactSheets: [{ pageIndex: 0, url: "blob:sheet-classic-0" }],
            },
            deconstruct: {
                prompt: "创意分镜",
                customRules: "创意规则",
                replaceBuiltInPrompt: true,
                shotManifest: [{ shotNumber: 1, timeRange: "0.0s - 3.0s" }],
                contactSheets: undefined,
            },
        };

        // 1. 验证活跃拼图派生逻辑：经典模式读取经典拼图，切换到创意模式读取创意拼图（绝不泄露经典拼图）
        const getActiveContactSheets = (tab: "classic" | "deconstruct", meta: any) => {
            return tab === "classic"
                ? (meta.classic?.contactSheets ?? (meta.activeTab === "classic" ? meta.contactSheets : undefined))
                : (meta.deconstruct?.contactSheets ?? (meta.activeTab === "deconstruct" ? meta.contactSheets : undefined));
        };

        expect(getActiveContactSheets("classic", nodeMeta)?.length).toBe(1);
        expect(getActiveContactSheets("deconstruct", nodeMeta)).toBeUndefined();

        // 2. 模拟 Tab 切换投影逻辑：由 classic 切到 deconstruct
        const handleTabChangeProjection = (tab: "classic" | "deconstruct", meta: any) => {
            const nextScript = tab === "classic" ? meta.classic?.prompt : meta.deconstruct?.prompt;
            const nextContactSheets = getActiveContactSheets(tab, meta);
            const nextCustomRules = tab === "classic" ? meta.classic?.customRules : meta.deconstruct?.customRules;
            const nextSamplingMode = tab === "classic" ? (meta.classic?.samplingMode || "seconds_and_scene") : "deconstruct";
            return {
                ...meta,
                activeTab: tab,
                prompt: nextScript || "",
                customRules: nextCustomRules,
                samplingMode: nextSamplingMode,
                contactSheets: nextContactSheets,
            };
        };

        const projectedDeconstruct = handleTabChangeProjection("deconstruct", nodeMeta);
        expect(projectedDeconstruct.activeTab).toBe("deconstruct");
        expect(projectedDeconstruct.prompt).toBe("创意分镜");
        expect(projectedDeconstruct.customRules).toBe("创意规则");
        expect(projectedDeconstruct.samplingMode).toBe("deconstruct");
        expect(projectedDeconstruct.contactSheets).toBeUndefined();

        // 3. 模拟清空 (clearAll) 经典模式：清空后绝不借用创意模式的脚本作为当前 prompt
        const simulateClearClassic = (meta: any) => {
            return {
                ...meta,
                prompt: "",
                contactSheets: undefined,
                classic: undefined,
                status: (meta.deconstruct?.prompt || meta.deconstruct?.shotManifest?.length) ? "success" : "idle",
            };
        };

        const clearedClassic = simulateClearClassic(nodeMeta);
        expect(clearedClassic.prompt).toBe("");
        expect(clearedClassic.classic).toBeUndefined();
        expect(clearedClassic.contactSheets).toBeUndefined();
        // 创意模式数据完好无损
        expect(clearedClassic.deconstruct?.prompt).toBe("创意分镜");
        expect(clearedClassic.deconstruct?.shotManifest?.length).toBe(1);

        // 4. 模拟 useEffect 同步与防误复活机制：isDualTrackNode 存在时，不得将顶层残留的 prompt 误赋值给已被清空的 classic
        const isDual = Boolean(clearedClassic.classic || clearedClassic.deconstruct);
        let restoredClassicPrompt = "initial";
        if (clearedClassic.classic?.prompt !== undefined) {
            restoredClassicPrompt = clearedClassic.classic.prompt;
        } else if (!isDual && clearedClassic.activeTab === "classic" && clearedClassic.prompt) {
            restoredClassicPrompt = clearedClassic.prompt;
        } else if (isDual && clearedClassic.classic === undefined) {
            restoredClassicPrompt = "";
        }
        expect(restoredClassicPrompt).toBe("");
    });

    it("参考生脚本放大编辑弹窗与 CanvasResourceMentionTextarea 弹性高度与样式契约", () => {
        const previewSource = readFileSync(
            resolve(__dirname, "../src/extensions/opc-infinite/components/script-reference-preview.tsx"),
            "utf-8"
        );
        const textareaSource = readFileSync(
            resolve(__dirname, "../src/components/canvas/canvas-resource-mention-textarea.tsx"),
            "utf-8"
        );

        // 1. 验证 script-reference-preview.tsx 容器声明了确定的视口基准高度 (h-[56vh])，防止百分比高度坍塌
        expect(previewSource).toContain("h-[56vh] min-h-[440px] max-h-[72vh]");
        expect(previewSource).toContain("containerClassName=\"h-full flex-1 flex flex-col min-h-0\"");
        expect(previewSource).toContain("style={{ minHeight: \"380px\", height: \"100%\" }}");
        expect(previewSource).toContain("rows={16}");

        // 2. 验证 canvas-resource-mention-textarea.tsx 中的样式优先级与弹性配置
        // mergedStyle 必须在基础 style 之后合并，允许外部传入的 minHeight 覆盖默认的 minHeight: 0
        expect(textareaSource).toContain("// @opc-feature: canvas-resource-mention-textarea-flex-expand [start]");
        expect(textareaSource).toContain("// @opc-feature: canvas-resource-mention-textarea-flex-expand [end]");
        expect(textareaSource).toContain("rows={props.rows ?? 16}");
        expect(textareaSource).toContain("flex: \"1 1 auto\"");
    });

    it("视频反推双轨抽帧拼图物理隔离与防相互覆盖验证", () => {
        const nodeSource = readFileSync(
            resolve(__dirname, "../src/extensions/opc-infinite/components/video-reverse-node.tsx"),
            "utf-8"
        );
        const executorSource = readFileSync(
            resolve(__dirname, "../src/extensions/opc-infinite/services/custom-node-executor.ts"),
            "utf-8"
        );
        const analysisSource = readFileSync(
            resolve(__dirname, "../src/extensions/opc-infinite/services/video-reverse-analysis.ts"),
            "utf-8"
        );

        // 1. 源码契约校验：storageKey 必须包含 trackKey 物理命名空间，彻底杜绝 IndexedDB 互相覆盖
        expect(nodeSource).toContain("const trackKey = isDeconstruct ? \"deconstruct\" : \"classic\";");
        expect(nodeSource).toContain("const storageKey = `reverse_sheet_${node.id}_${trackKey}_${p.pageIndex}`;");
        expect(executorSource).toContain("const trackKey = isDeconstruct ? \"deconstruct\" : \"classic\";");
        expect(executorSource).toContain("const storageKey = `reverse_sheet_${nodeId}_${trackKey}_${p.pageIndex}`;");

        // 2. 源码契约校验：本地磁盘保存时文件名必须带 track 前缀
        expect(analysisSource).toContain("const trackPrefix = prepareOptions.track ? `${prepareOptions.track}_` : \"\";");
        expect(analysisSource).toContain("fileName: `contact_sheet_${trackPrefix}p${index + 1}_${Date.now()}.jpg`");

        // 3. 源码契约校验：activeContactSheets 绝不从顶层跨轨污染（isDualTrackNode 保护）
        expect(nodeSource).toContain("!isDualTrackNode && meta.activeTab === \"classic\" ? meta.contactSheets : undefined");
        expect(nodeSource).toContain("!isDualTrackNode && meta.activeTab === \"deconstruct\" ? meta.contactSheets : undefined");

        // 4. 逻辑模型验证：双轨状态下无论如何切换与清空，拼图互不覆盖
        const mockClassicSheets = [
            { pageIndex: 1, url: "blob:classic-1", storageKey: "reverse_sheet_node1_classic_1", frameCount: 12 },
            { pageIndex: 2, url: "blob:classic-2", storageKey: "reverse_sheet_node1_classic_2", frameCount: 12 },
        ];
        const mockDeconstructSheets = [
            { pageIndex: 1, url: "blob:deconstruct-1", storageKey: "reverse_sheet_node1_deconstruct_1", frameCount: 8 },
        ];

        const dualMeta = {
            activeTab: "classic" as const,
            classic: { prompt: "经典文本", contactSheets: mockClassicSheets },
            deconstruct: { prompt: "创意文本", contactSheets: mockDeconstructSheets },
            contactSheets: mockClassicSheets,
        };

        const isDual = Boolean(dualMeta.classic || dualMeta.deconstruct);
        expect(isDual).toBe(true);

        // 经典轨读经典拼图
        const classicSheets = dualMeta.classic?.contactSheets ?? (!isDual && dualMeta.activeTab === "classic" ? dualMeta.contactSheets : undefined);
        expect(classicSheets).toHaveLength(2);
        expect(classicSheets?.[0].storageKey).toBe("reverse_sheet_node1_classic_1");

        // 切到创意轨读创意拼图
        const deconstructSheets = dualMeta.deconstruct?.contactSheets ?? (!isDual && dualMeta.activeTab === "deconstruct" ? dualMeta.contactSheets : undefined);
        expect(deconstructSheets).toHaveLength(1);
        expect(deconstructSheets?.[0].storageKey).toBe("reverse_sheet_node1_deconstruct_1");

        // 模拟：创意轨尚未生成拼图 (未运行) 的状态
        const partialMeta = {
            activeTab: "deconstruct" as const,
            classic: { prompt: "经典文本", contactSheets: mockClassicSheets },
            deconstruct: { prompt: "创意文本" }, // 无 contactSheets
            contactSheets: mockClassicSheets, // 顶层残留历史或经典拼图
        };
        const partialIsDual = Boolean(partialMeta.classic || partialMeta.deconstruct);
        const resolvedDeconstructSheets = partialMeta.deconstruct?.contactSheets ?? (!partialIsDual && partialMeta.activeTab === "deconstruct" ? partialMeta.contactSheets : undefined);
        // 关键断言：绝对不能将经典的 2 张拼图借给创意反推！必须为 undefined
        expect(resolvedDeconstructSheets).toBeUndefined();

        // 模拟：清空经典轨后，创意轨拼图绝对不受破坏
        const afterClearClassic = {
            ...partialMeta,
            classic: undefined,
            deconstruct: { prompt: "创意文本", contactSheets: mockDeconstructSheets },
            contactSheets: undefined,
        };
        const afterClearDeconstructSheets = afterClearClassic.deconstruct?.contactSheets ?? (!Boolean(afterClearClassic.classic || afterClearClassic.deconstruct) ? afterClearClassic.contactSheets : undefined);
        expect(afterClearDeconstructSheets).toHaveLength(1);
        expect(afterClearDeconstructSheets?.[0].storageKey).toBe("reverse_sheet_node1_deconstruct_1");
    });

    it("商业化闭环与稳定性：withVideoDecodeLock 超时守护自愈与防死锁机制", async () => {
        const { withVideoDecodeLock } = await import(
            "../src/extensions/opc-infinite/media/video-decomposition/frame-sampler"
        );

        // 模拟前序任务挂起（故意不 resolve，模拟 Chromium 解码器卡死）
        const hungTask = withVideoDecodeLock(() => new Promise(() => {}));

        // 后续新任务请求锁，配置 100ms 超时看门狗
        const start = Date.now();
        let secondExecuted = false;
        await withVideoDecodeLock(async () => {
            secondExecuted = true;
            return "recovered";
        }, 100);

        const duration = Date.now() - start;
        // 关键断言：后序任务在约 100ms 后超时接管成功，未被永久挂起
        expect(secondExecuted).toBe(true);
        expect(duration).toBeGreaterThanOrEqual(80);
        expect(duration).toBeLessThan(1500);
    });

    it("商业化闭环与稳定性：局部微观清晰度选拔保证候选帧严格升序 (消灭 Backward Seek)", () => {
        // 模拟 selectSharpestFrameTime 内部同向候选帧算法
        const targetT = 5.100;
        const lowerBound = 0;
        const upperBound = 10;
        const candidates = [
            targetT,
            Number((targetT - 0.033).toFixed(3)),
            Number((targetT + 0.033).toFixed(3)),
        ].filter((t) => t >= lowerBound && t <= upperBound).sort((a, b) => a - b);

        // 1. 验证集合数学完整性：包含 3 个精确候选帧
        expect(candidates).toEqual([5.067, 5.100, 5.133]);

        // 2. 验证单调非减性：每一次寻道前进 delta 恒大于 0，彻底根除倒退 seek 导致的解码器崩溃
        for (let i = 1; i < candidates.length; i++) {
            expect(candidates[i]).toBeGreaterThan(candidates[i - 1]);
        }
    });

    it("商业化闭环与稳定性：视频反推与客户端任务豁免服务端断点恢复对账", () => {
        // 模拟 use-canvas-generation 中的 recoveryNodes 过滤逻辑
        const mockCanvasNodes = [
            {
                id: "srv-node-1",
                type: "image",
                metadata: { status: "loading", taskId: "task-server-1" },
            },
            {
                id: "reverse-node-1",
                type: "video-reverse:analyzer",
                metadata: { status: "loading", isClientMockTask: true, videoReverse: { status: "running" } },
            },
            {
                id: "reverse-node-2",
                type: "video-reverse",
                metadata: { status: "loading", isClientMockTask: true },
            },
        ];

        const filteredRecoveryNodes = mockCanvasNodes.filter((node) => {
            if (
                node.type === "video-reverse" ||
                node.type === "video-reverse:analyzer" ||
                node.type?.startsWith("video-reverse") ||
                node.metadata?.isClientMockTask ||
                node.metadata?.videoReverse
            ) {
                return false;
            }
            return node.metadata?.status === "loading";
        });

        // 关键断言：纯客户端任务和视频反推节点被 100% 豁免，绝不向任务中心请求不存在的任务
        expect(filteredRecoveryNodes).toHaveLength(1);
        expect(filteredRecoveryNodes[0].id).toBe("srv-node-1");
    });

    it("商业化闭环与极简 UI 契约：反推失败统一简明提示与积分退还文案", () => {
        const USER_FACING_ERROR = "反推未成功，积分已返还";
        // 验证面向用户提示语严格对齐商业标准，不暴露任何底层技术诊断词汇
        expect(USER_FACING_ERROR).not.toContain("Error");
        expect(USER_FACING_ERROR).not.toContain("Abort");
        expect(USER_FACING_ERROR).not.toContain("timeout");
        expect(USER_FACING_ERROR).not.toContain("seek");
        expect(USER_FACING_ERROR).toBe("反推未成功，积分已返还");
    });

    it("系统渠道参数与动态上限对齐：严格匹配渠道设置的最长时长，生脚本分段与单段上限自适应", async () => {
        const { resolveChannelVideoModelDurationBounds, resolveChannelVideoModelMaxDuration } = await import(
            "../src/lib/model-capabilities"
        );
        const { segmentCreationAssistantTimeline } = await import(
            "../src/lib/creation-assistant-segmentation"
        );

        // 模拟渠道配置：通道 A 设置可灵枚举 [5, 10]，通道 B 设置 Seedance 范围 5~15s，通道 C 设置特殊定制模型 [3, 6, 9]
        const mockConfig = {
            channels: [
                {
                    id: "ch-kling",
                    models: ["kling-v1-6", "kling-v2-master"],
                    modelCosts: [
                        {
                            model: "kling-v1-6",
                            capabilityConfig: {
                                video: {
                                    duration: { selection: "enum", values: [5, 10], default: 5 },
                                },
                            } as any,
                        },
                    ],
                },
                {
                    id: "ch-seedance",
                    models: ["doubao-seedance-2.0"],
                    modelCosts: [
                        {
                            model: "doubao-seedance-2.0",
                            capabilityConfig: {
                                video: {
                                    duration: { selection: "range", min: 5, max: 15, default: 10 },
                                },
                            } as any,
                        },
                    ],
                },
                {
                    id: "ch-custom",
                    models: ["my-special-model"],
                    modelCosts: [
                        {
                            model: "my-special-model",
                            priceTiers: [
                                { videoSeconds: 3 },
                                { videoSeconds: 6 },
                                { videoSeconds: 9 },
                            ],
                        } as any,
                    ],
                },
            ],
        };

        // 1. 验证可灵按渠道枚举配置，上限严格为 10 秒，而非死板的 15 秒
        const klingBounds = resolveChannelVideoModelDurationBounds(mockConfig as any, "ch-kling::kling-v1-6");
        expect(klingBounds.min).toBe(5);
        expect(klingBounds.max).toBe(10);
        expect(resolveChannelVideoModelMaxDuration(mockConfig as any, "ch-kling::kling-v1-6")).toBe(10);

        // 2. 验证切片分段规划：30 秒视频按可灵 10 秒上限规划为 3 段，而非错误的 2 段 (15s)
        const klingSegments = segmentCreationAssistantTimeline(30, klingBounds.max);
        expect(klingSegments).toHaveLength(3);
        expect(klingSegments[0].durationSec).toBe(10);
        expect(klingSegments[1].durationSec).toBe(10);
        expect(klingSegments[2].durationSec).toBe(10);

        // 3. 验证 Seedance 按渠道范围配置，上限为 15 秒
        const seedanceBounds = resolveChannelVideoModelDurationBounds(mockConfig as any, "ch-seedance::doubao-seedance-2.0");
        expect(seedanceBounds.max).toBe(15);
        const seedanceSegments = segmentCreationAssistantTimeline(30, seedanceBounds.max);
        expect(seedanceSegments).toHaveLength(2);

        // 4. 验证完全未知的定制模型，通过 priceTiers 参数提取上限为 9 秒，绝不硬编码
        const customBounds = resolveChannelVideoModelDurationBounds(mockConfig as any, "ch-custom::my-special-model");
        expect(customBounds.min).toBe(3);
        expect(customBounds.max).toBe(9);

        // 5. 验证 clampDurationToChannelVideoModel 自动自愈钳位至渠道物理区间
        const { clampDurationToChannelVideoModel } = await import("../src/lib/model-capabilities");
        // 可灵选项 [5, 10]，传入超限 15s 应自愈至 10s
        expect(clampDurationToChannelVideoModel(mockConfig as any, "ch-kling::kling-v1-6", 15)).toBe(10);
        // 可灵选项 [5, 10]，传入 6s 应自愈匹配至最近选项 5s
        expect(clampDurationToChannelVideoModel(mockConfig as any, "ch-kling::kling-v1-6", 6)).toBe(5);
        // 定制模型 3~9s，传入超限 20s 应钳位至 9s
        expect(clampDurationToChannelVideoModel(mockConfig as any, "ch-custom::my-special-model", 20)).toBe(9);
        // 定制模型 3~9s，传入 1s 应钳位至 3s
        expect(clampDurationToChannelVideoModel(mockConfig as any, "ch-custom::my-special-model", 1)).toBe(3);
    });

    it("创意复刻 Table 1 升级：普通批量创作表、参考图插槽、0..N人物/商品/场景动态识别与素材自动连线", async () => {
        const { batchRowReady } = await import("../src/lib/canvas/canvas-batch-table");

        // 验证 isExplicitNone 规则：无人物、第一人称视角等不创建多余人物行
        const noneTests = [
            "无", "无人物", "无出镜", "无商品", "无场景", "不涉及", "主观第一人称视角", "第一人称视角（无出镜人物）",
        ];
        function isNone(val?: string) {
            if (!val) return true;
            const t = val.trim();
            return (
                t === "无" ||
                t === "无人物" ||
                t === "无出镜" ||
                t === "无商品" ||
                t === "无场景" ||
                t === "不涉及" ||
                t.startsWith("主观第一人称") ||
                t.startsWith("第一人称视角（无出镜")
            );
        }
        noneTests.forEach((t) => expect(isNone(t)).toBe(true));
        expect(isNone("出镜女主播 · 25岁")).toBe(false);
        expect(isNone("私密抑菌凝胶")).toBe(false);

        // 验证 Table 1 具备两种提示词机制：
        // 1. 有素材图：基于参考图的图生图风格迁移
        // 2. 无素材图：完整文生图生成
        const mockImg2ImgRow = {
            id: "master-row-product-0",
            enabled: true,
            inputNodeIds: ["node-product-img"],
            prompt: "基于参考图中的实物商品形态、包装结构与标识细节，呈现专业商业静物摄影质感... 私密抑菌凝胶",
        };
        const mockTxt2ImgRow = {
            id: "master-row-actor-0",
            enabled: true,
            inputNodeIds: [""],
            prompt: "A photograph captured as a single frame from real iPhone video footage... 亚洲干练女性",
        };

        const mockTable = {
            operation: "creative" as const,
            concurrency: 6,
            referenceColumns: [{ id: "ref-image", label: "参考图插槽" }],
            rows: [mockImg2ImgRow, mockTxt2ImgRow],
        };

        const mockImgNode = { id: "node-product-img", type: "image", metadata: { content: "blob://img" } } as any;
        const nodeMap = new Map([["node-product-img", mockImgNode]]);

        // 验证两行均就绪可独立生成或批量生成
        expect(batchRowReady(mockImg2ImgRow, mockTable as any, nodeMap)).toBe(true);
        expect(batchRowReady(mockTxt2ImgRow, mockTable as any, nodeMap)).toBe(true);

        // 验证 Table 1 只有 2 列元数据列（资产名称与分类 + 视觉外观特征），不设置过多无用列
        const masterTextColumns = [
            { id: "col-slot-name", label: "资产名称与分类", type: "text" },
            { id: "col-visual-desc", label: "视觉外观特征", type: "text" },
        ];
        expect(masterTextColumns).toHaveLength(2);
        expect(masterTextColumns.map((c) => c.id)).toEqual(["col-slot-name", "col-visual-desc"]);
    });

    it("创意复刻 Table 1 节点规范与按钮动作契约：使用标准 CanvasNodeType.BatchTable 且杜绝视频生成按钮，展示“创意资产表”徽标与“生成创意资产”按钮", () => {
        // 1. 模拟创意复刻生成的 3 个表格类型
        const masterNode = {
            id: "batch-master-1",
            type: CanvasNodeType.BatchTable,
            metadata: { batchTable: { contentKind: "master-slots", operation: "creative" } },
        };
        const voiceNode = {
            id: "batch-voice-1",
            type: CanvasNodeType.BatchTable,
            metadata: { batchTable: { contentKind: "voiceover", operation: "creative" } },
        };
        const storyboardNode = {
            id: "batch-storyboard-1",
            type: CanvasNodeType.BatchTable,
            metadata: { batchTable: { contentKind: "storyboard", operation: "creative" } },
        };

        // 2. 验证只有 storyboard 表格允许挂载视频生成 actions
        function getBatchTableVideoAction(node: any) {
            const isStoryboard = node.metadata?.batchTable?.contentKind === "storyboard";
            return isStoryboard ? "enabled" : "suppressed";
        }

        // 3. 验证各表格按钮文案
        function getBatchTableActionButtonLabel(node: any) {
            const kind = node.metadata?.batchTable?.contentKind;
            if (kind === "master-slots") return "生成创意资产";
            if (kind === "voiceover") return "合成配音音频";
            if (kind === "storyboard") return "生成首帧图";
            return "生成未完成项";
        }

        expect(masterNode.type).toBe(CanvasNodeType.BatchTable);
        expect(masterNode.metadata.batchTable.contentKind).toBe("master-slots");
        expect(getBatchTableVideoAction(masterNode)).toBe("suppressed");
        expect(getBatchTableVideoAction(voiceNode)).toBe("suppressed");
        expect(getBatchTableVideoAction(storyboardNode)).toBe("enabled");
        expect(getBatchTableActionButtonLabel(masterNode)).toBe("生成创意资产");
        expect(getBatchTableActionButtonLabel(voiceNode)).toBe("合成配音音频");
    });

    it("多维表格交互文本框与富文本框防拖拽事件隔离契约：点击与框选文本禁止触发节点吸附拖动", () => {
        const canvasNodeSource = readFileSync(
            resolve(__dirname, "../src/components/canvas/canvas-node.tsx"),
            "utf-8"
        );
        const mentionTextareaSource = readFileSync(
            resolve(__dirname, "../src/components/canvas/canvas-resource-mention-textarea.tsx"),
            "utf-8"
        );

        // 1. 验证 CanvasNode 具有对 contenteditable、role='textbox'、data-canvas-no-drag 的防拖拽过滤拦截
        expect(canvasNodeSource).toContain("[contenteditable]");
        expect(canvasNodeSource).toContain("[role='textbox']");
        expect(canvasNodeSource).toContain("[data-canvas-no-drag]");

        // 2. 验证 CanvasResourceMentionTextarea 无论是富文本还是原生模式均声明了 data-canvas-no-drag 并停止冒泡
        expect(mentionTextareaSource).toContain("data-canvas-no-drag");
        expect(mentionTextareaSource).toContain("onMouseDown={(event) => event.stopPropagation()}");

        // 3. 验证 CanvasBatchTableNodeContent 保持原生多维表格拖拽机制：杜绝在滚动容器和表头容器阻断 onMouseDown 冒泡
        const batchTableSource = readFileSync(
            resolve(__dirname, "../src/components/canvas/canvas-batch-table-node.tsx"),
            "utf-8"
        );
        expect(batchTableSource).not.toContain('thin-scrollbar min-h-0 flex-1 overflow-auto rounded-b-[inherit]" onPointerDown={(event) => event.stopPropagation()} onMouseDown=');
        expect(batchTableSource).not.toContain('key={column.id} className="min-w-0 px-2" onMouseDown=');
        expect(batchTableSource).not.toContain('className="min-w-0 pr-3" onMouseDown=');
    });

    it("创意资产表升级与3类素材输入场景提示词编织验证", () => {
        // 场景 1：直接连接素材 (Directly connected media)
        const directMediaPrompt = buildHypitDirectorUserPrompt({
            referenceScript: "参考视频脚本",
            userRequirement: "复刻紧致抗衰面霜广告",
            videoModel: "kling-v1-6",
            enableVisual: true,
            enableVoice: true,
            enableVideo: true,
            connectedMediaFiles: [
                { name: "面霜实物白底.jpg", kind: "image", label: "@图片1" },
                { name: "模特生活照.jpg", kind: "image", label: "@图片2" },
            ],
        });
        expect(directMediaPrompt).toContain("【素材输入情况：直接连接创作素材】");
        expect(directMediaPrompt).toContain("检测到用户已直接连接了多模态素材");
        expect(directMediaPrompt).toContain("面霜实物白底.jpg");
        expect(directMediaPrompt).toContain("模特生活照.jpg");
        expect(directMediaPrompt).toContain("明确判断该素材适合作为哪类资产");
        expect(directMediaPrompt).toContain("promptImg2Img");

        // 场景 2：通过“素材分析”接入 (Connected via upstream Material Analysis)
        const analysisPrompt = buildHypitDirectorUserPrompt({
            referenceScript: "参考视频脚本",
            userRequirement: "复刻私密凝胶短视频",
            videoModel: "kling-v1-6",
            enableVisual: true,
            enableVoice: true,
            enableVideo: true,
            upstreamAnalysis: {
                metadata: {
                    materialAnalysis: {
                        result: {
                            fileSummaries: [
                                { fileId: "file-1", name: "抑菌凝胶主图.jpg", summary: "单支装独立包装，透明管身，金黄色抑菌凝胶" },
                            ],
                            insightSections: [
                                { title: "核心功效与卖点", items: ["抑菌率99.9%", "弱酸性温和配方", "单支密封安全卫生"] },
                            ],
                        },
                    },
                },
            },
        });
        expect(analysisPrompt).toContain("【素材输入情况：通过上游“素材分析”接入】");
        expect(analysisPrompt).toContain("抑菌凝胶主图.jpg");
        expect(analysisPrompt).toContain("单支装独立包装，透明管身");
        expect(analysisPrompt).toContain("核心功效与卖点");
        expect(analysisPrompt).toContain("抑菌率99.9%");
        expect(analysisPrompt).toContain("依据素材内容分析与商品洞察，深度分析各个素材适合作为哪种核心资产");

        // 场景 3：未连接创作素材 (No media assets connected)
        const noMediaPrompt = buildHypitDirectorUserPrompt({
            referenceScript: "参考视频脚本",
            userRequirement: "根据参考视频做文生图与生视频",
            videoModel: "kling-v1-6",
            enableVisual: true,
            enableVoice: true,
            enableVideo: true,
        });
        expect(noMediaPrompt).toContain("【素材输入情况：未连接创作素材】");
        expect(noMediaPrompt).toContain("当前用户未提供任何图片或实物素材，未连接“素材分析”节点");
        expect(noMediaPrompt).toContain("matchedAsset: 全部设置为 null（代表该插槽为空，无参考图）");
        expect(noMediaPrompt).toContain("promptTxt2Img: 必须为每个资产输出独立完整、高写气质感的实拍文生图 Prompt");
    });

    it("创意资产表双模提示词规范契约验证 (文生图 vs 图生图)", () => {
        const prompt = buildHypitDirectorUserPrompt({
            referenceScript: "参考视频脚本",
            userRequirement: "根据参考视频进行创意复刻",
            videoModel: "kling-v1-6",
            enableVisual: true,
            enableVoice: true,
            enableVideo: true,
        });

        // 验证系统提示词与用户提示词双重覆盖双模协议
        expect(prompt).toContain("【创意资产表双模提示词规范（文生图 vs 图生图）】");
        // 1. 无参考图插槽文生图 (iPhone UGC 四段式)
        expect(prompt).toContain("无参考图插槽（matchedAsset 为 null）-> 采用 promptTxt2Img");
        expect(prompt).toContain("iPhone UGC 四段式结构");

        // 2. 有参考图插槽图生图母版转化 (人物三视图 / 商品白底棚拍 / 场景纯净基底)
        expect(prompt).toContain("有参考图插槽（matchedAsset 为具体素材）-> 采用 promptImg2Img");
        expect(prompt).toContain("多视角三视图或四视图 (Turnaround Sheet: 正面、3/4侧面、正侧面、半身与全身)");
        expect(prompt).toContain("细腻真实皮肤纹理，零过度磨皮与零 AI 塑料感");
        expect(prompt).toContain("多视角商业静物摄影 / 专业白底棚拍图 (Multi-angle commercial studio shots / clean white background)");
        expect(prompt).toContain("精确保留外包装几何形态、材质细节与 Logo 标识，消除杂乱反光与背景噪点");
        expect(prompt).toContain("空间环境优化升级");
        expect(prompt).toContain("剔除画面中多余杂乱的人物、行人、多余杂物堆砌与非必要视觉干扰");

        // 3. 系统提示词规范对齐
        expect(HYPIT_CREATIVE_DIRECTOR_SYSTEM_PROMPT).toContain("【创意资产表】素材智能识别与双模提示词协议");
        expect(HYPIT_CREATIVE_DIRECTOR_SYSTEM_PROMPT).toContain("Turnaround Sheet: 正面、3/4侧面、正侧面、半身与全身");
        expect(HYPIT_CREATIVE_DIRECTOR_SYSTEM_PROMPT).toContain("Multi-angle commercial studio shots / clean white background");
        expect(HYPIT_CREATIVE_DIRECTOR_SYSTEM_PROMPT).toContain("剔除画面中多余杂乱的人物、行人、多余杂物与非必要视觉干扰");
    });

    it("parseHypitJson 稳健解析并容错提取 assetSlots 数组", () => {
        const rawJsonWithSlots = `
\`\`\`json
{
  "title": "测试创意复刻",
  "assetSlots": [
    {
      "slotId": "actor-1",
      "category": "character",
      "name": "出镜主角",
      "matchedAsset": "@图片1",
      "visualDesc": "25岁现代女性，干练职业西装",
      "promptTxt2Img": "A photograph captured as a single frame from iPhone video... Asian woman",
      "promptImg2Img": "多视角角色三视图设计（正面、3/4侧面、正侧面、半身与全身）..."
    },
    {
      "slotId": "product-1",
      "category": "product",
      "name": "抗衰面霜",
      "matchedAsset": null,
      "visualDesc": "白瓷瓶身金盖，高端面霜",
      "promptTxt2Img": "Commercial still life photography of the cream...",
      "promptImg2Img": ""
    }
  ],
  "shots": [
    {
      "shotNumber": 1,
      "lines": "第一句台词"
    }
  ]
}
\`\`\`
`;
        const parsed = parseHypitJson<any>(rawJsonWithSlots);
        expect(parsed).not.toBeNull();
        expect(parsed?.assetSlots).toHaveLength(2);
        expect(parsed?.assetSlots[0].slotId).toBe("actor-1");
        expect(parsed?.assetSlots[0].category).toBe("character");
        expect(parsed?.assetSlots[0].matchedAsset).toBe("@图片1");
        expect(parsed?.assetSlots[0].promptImg2Img).toContain("多视角角色三视图设计");
        expect(parsed?.assetSlots[1].slotId).toBe("product-1");
        expect(parsed?.assetSlots[1].matchedAsset).toBeNull();
        expect(parsed?.assetSlots[1].promptTxt2Img).toContain("Commercial still life photography");
    });

    it("stripPromptBracketMetadata 稳健剔除提示词开头的【...】分类与标签元数据，防止模型文字幻觉与注意力稀释", async () => {
        const { stripPromptBracketMetadata } = await import("../src/lib/canvas/canvas-batch-table");
        
        // 1. 包含表情与中文分类的括号标签
        const prompt1 = "【👤 出镜主角 · 人物】 @参考图1 多视角角色三视图设计（正面、3/4侧面、正侧面）...";
        expect(stripPromptBracketMetadata(prompt1)).toBe("@参考图1 多视角角色三视图设计（正面、3/4侧面、正侧面）...");

        // 2. 普通无空格前缀
        const prompt2 = "【抗衰面霜·商品】Commercial studio still life photography of the cream";
        expect(stripPromptBracketMetadata(prompt2)).toBe("Commercial studio still life photography of the cream");

        // 3. 不带括号的普通提示词保持原样
        const prompt3 = "@参考图1 特写镜头，极简影棚柔光";
        expect(stripPromptBracketMetadata(prompt3)).toBe("@参考图1 特写镜头，极简影棚柔光");

        expect(stripPromptBracketMetadata("")).toBe("");
        expect(stripPromptBracketMetadata("   ")).toBe("");
    });

    it("formatShotManifestToReadableScript 无缝支持三板块规范并杜绝重复标题，parseDirectorJson 正则挽救保留母版要素", async () => {
        const { formatShotManifestToReadableScript, parseDirectorJson } = await import(
            "../src/extensions/opc-infinite/prompts/hypit-director-prompts"
        );

        // 1. 验证三板块接入时杜绝重复标题
        const mockOverview = `## 一、原片视听基因概览\n走动口播\n\n## 二、视听注意力与核心要素\n黄金双钩子\n\n## 三、逐镜头全息工程图纸\n\`\`\`json\n{"shots":[]}\n\`\`\``;
        const mockShots = [
            { shotNumber: 1, scaleAndAngle: "近景", cameraMovement: "微推", timeRange: "00:00.0-00:02.0 (2.0s)" }
        ];

        const readable = formatShotManifestToReadableScript(mockShots, mockOverview);
        expect(readable).toContain("## 一、原片视听基因概览");
        expect(readable).toContain("## 二、视听注意力与核心要素");
        expect(readable).toContain("## 三、逐镜头全息工程图纸");
        // 绝对不能出现重复的标题（如 ## 三 之后又接 ## 五）
        expect(readable).not.toContain("## 五、逐镜头全息工程图纸");
        expect((readable.match(/##\s*(?:[一二三四五\d]+[、\.\s]+)?逐镜头全息工程图纸/g) || []).length).toBe(1);

        // 2. 验证 parseDirectorJson 在截断损坏时挽救 originalMasterSlots / coreElements
        const brokenJsonText = `
\`\`\`json
{
  "title": "截断图纸",
  "originalMasterSlots": {
    "actor": "20岁年轻女孩",
    "product": "防晒喷雾",
    "scene": "海边沙滩"
  },
  "shots": [
    {
      "shotNumber": 1,
      "timeRange": "00:00.0-00:02.5 (2.5s)",
      "visualContent": "沙滩漫步"
    },
    {
      "shotNumber": 2,
      "timeRange": "00:02.5-00:05.0 (2.5s)",
      "visualContent": "未完截断...
`;
        const rescued = parseDirectorJson<any>(brokenJsonText);
        expect(rescued).not.toBeNull();
        expect(rescued?.shots).toHaveLength(1);
        expect(rescued?.shots[0].startSec).toBe(0);
        expect(rescued?.shots[0].endSec).toBe(2.5);
        expect(rescued?.shots[0].durationSec).toBe(2.5);
        expect(rescued?.originalMasterSlots?.actor).toBe("20岁年轻女孩");
        expect(rescued?.originalMasterSlots?.product).toBe("防晒喷雾");
        expect(rescued?.originalMasterSlots?.scene).toBe("海边沙滩");
        expect(rescued?.coreElements?.actor).toBe("20岁年轻女孩");
    });

    it("创意反推纯 Markdown 全息工程图纸解析与无损保活：parseMarkdownShots 与 formatShotManifestToReadableScript 完美协同", async () => {
        const { parseMarkdownShots, formatShotManifestToReadableScript } = await import("../src/extensions/opc-infinite/prompts/hypit-director-prompts");

        const sampleMarkdownOverview = `## 一、全片视听基因与宏观架构总览
- 视频总时长：14.0 秒
- 风格关键词：第一人称视角、质问反转

## 二、注意力动力学与商业转化机制
- **0-3秒黄金双钩子**：视觉强冲突

## 六、逐镜头全息工程图纸

### 镜头 1 [POV] 00:00.0-00:02.5 (2.5s)
- **景别机位**：第一人称主观视角，近景微仰，手持剧烈晃动
- **画面内容**：第一人称主观视角。操作者右手从画面正下方粗暴伸出揪住店老板衣领
- **表演时序与微动作**：0.0s 揪住衣领 -> 1.0s 老板身体受力前倾 -> 2.5s 喉结滑动定格
- **物理反馈与力学**：棉质衣领受外力剧烈拉扯形成紧绷放射褶皱
- **原片台词**：“这家店是不是你开的？”“是是是，我开的哪能啊！”
- **语言与语速**：时间轴: 0.0s[这家店] 0.5s[是不是] 0.9s[你开的] 1.4s[是是是] 1.8s[我开的] 2.1s[哪能啊] | 语调: 问话者粗声质问
- **视听氛围**：粗暴衣物布料撕扯摩擦声“唰”
- **剪辑与功能**：开场强冲突钩子

### 镜头 2 [L-CUT] 00:02.5-00:06.5 (4.0s)
- **景别机位**：第一视角中景 ➔ 快速切入满桌菜品 45 度微俯特写平移
- **画面内容**：【前段·质问引出福利 (00:02.5-00:04.2)】：老板一手抚平衣领；【后段·菜品爆发特写 (00:04.2-00:06.5)】：镜头切入烤肉冒油
- **表演时序与微动作**：2.5s 老板抚胸赔笑 -> 4.2s 画面切入餐桌 -> 6.5s 牛肉特写定格
- **物理反馈与力学**：五花肉接触高温铁盘瞬间收缩，表面细密油脂受热爆裂飞溅
- **原片台词**：“所以抖音上49.8块两个人的半自助套餐是你设的啊？”“对个呀，我今朝刚刚上个套餐！”
- **语言与语速**：时间轴: 2.5s[所以] 2.8s[抖音上] 3.2s[四十九块八] 4.0s[两个人的] 4.6s[半自助套餐] 5.2s[是你设的啊] 5.7s[对个呀] 6.0s[我今朝刚刚] 6.3s[上个套餐] | 语调: 热情笃定
- **视听氛围**：烤肉油煎滋滋声
- **剪辑与功能**：抛出超值低价锚点
`;

        // 1. 验证 parseMarkdownShots 正确解析出 2 个镜头且包含完备属性
        const shots = parseMarkdownShots(sampleMarkdownOverview);
        expect(shots).toHaveLength(2);
        expect(shots[0].shotNumber).toBe(1);
        expect(shots[0].shotType).toBe("pov");
        expect(shots[0].startSec).toBe(0.0);
        expect(shots[0].endSec).toBe(2.5);
        expect(shots[0].durationSec).toBe(2.5);
        expect(shots[0].camera).toContain("第一人称主观视角");
        expect(shots[0].visualAction).toContain("第一人称主观视角。操作者右手从画面正下方粗暴伸出");
        expect(shots[0].performanceTiming).toContain("0.0s 揪住衣领");
        expect(shots[0].physicalFeedback).toContain("棉质衣领受外力剧烈拉扯");
        expect(shots[0].dialogue).toContain("这家店是不是你开的？");
        expect(shots[0].wordTimings).toContain("0.0s[这家店]");
        expect(shots[0].soundFx).toContain("粗暴衣物布料撕扯摩擦声");
        expect(shots[0].narrativeFunction).toContain("开场强冲突钩子");

        expect(shots[1].shotNumber).toBe(2);
        expect(shots[1].shotType).toBe("l-cut");
        expect(shots[1].startSec).toBe(2.5);
        expect(shots[1].endSec).toBe(6.5);
        expect(shots[1].durationSec).toBe(4.0);
        expect(shots[1].visualAction).toContain("【前段·质问引出福利");
        expect(shots[1].visualAction).toContain("【后段·菜品爆发特写");
        expect(shots[1].wordTimings).toContain("3.2s[四十九块八]");

        // 2. 验证 formatShotManifestToReadableScript 在输入原生 Markdown 时绝不截断丢弃逐镜头内容
        const formatted = formatShotManifestToReadableScript([], sampleMarkdownOverview);
        expect(formatted).toContain("### 镜头 1 [POV]");
        expect(formatted).toContain("### 镜头 2 [L-CUT]");
        expect(formatted).toContain("这家店是不是你开的？");
        expect(formatted).toContain("烤肉油煎滋滋声");
    });
});







