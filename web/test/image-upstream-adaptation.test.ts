import { describe, expect, test } from "bun:test";
import {
    detectUpstreamImageRequirement,
    isPublicMediaUrl,
    resolveUpstreamImageReference,
} from "../src/services/image-storage";
import type { AiConfig } from "../src/stores/use-config-store";

describe("生图工作台上游图片自适应协议 (Image Workbench Upstream Image Adaptation)", () => {
    const baseConfig: AiConfig = {
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        model: "gpt-4o",
        textModel: "gpt-4o",
        imageModel: "dall-e-3",
        videoModel: "video-model",
        systemPrompt: "",
        size: "1024x1024",
        quality: "standard",
        count: 1,
        transparentBackground: "false",
        videoSeconds: "5",
        vquality: "720p",
        videoGenerateAudio: "false",
        videoWatermark: "false",
        videoArkPrivateAssetUpload: "false",
        audioVoice: "alloy",
        audioFormat: "wav",
        audioSpeed: "1.0",
        audioLanguage: "zh",
        audioDialect: "",
        audioInstructions: "",
        channels: [],
        models: [],
    };

    test("isPublicMediaUrl 准确定界公网 URL 与本地/私有/内联媒体", () => {
        expect(isPublicMediaUrl("https://cdn.example.com/image.png")).toBe(true);
        expect(isPublicMediaUrl("http://localhost:8080/static/pic.jpg")).toBe(true);
        expect(isPublicMediaUrl("https://oss.mycorp.com/users/u1/photo.webp?token=123")).toBe(true);

        // 非公网 URL 必须为 false
        expect(isPublicMediaUrl("/api/resources/57713a49c2a4cbadcb5c34c0d1ff28fb/file")).toBe(false);
        expect(isPublicMediaUrl("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==")).toBe(false);
        expect(isPublicMediaUrl("blob:http://localhost:3000/d5985869-2319-482a-a92d")).toBe(false);
        expect(isPublicMediaUrl("resource:57713a49c2a4cbadcb5c34c0d1ff28fb")).toBe(false);
        expect(isPublicMediaUrl("asset://ark-asset-12345")).toBe(false);
        expect(isPublicMediaUrl("")).toBe(false);
    });

    test("detectUpstreamImageRequirement 正确识别各渠道/协议的图片格式要求", () => {
        // 1. 原生 Gemini 协议：强制内联 Base64
        const geminiConfig: AiConfig = {
            ...baseConfig,
            apiFormat: "gemini",
            model: "gemini-2.5-flash",
        };
        expect(detectUpstreamImageRequirement(geminiConfig)).toBe("require-base64");

        // 2. Gemini 生图协议 (gemini-image)：强制内联 Base64
        const geminiImageConfig: AiConfig = {
            ...baseConfig,
            interfaceType: "gemini-image",
            model: "imagen-3.0-generate-002",
        };
        expect(detectUpstreamImageRequirement(geminiImageConfig)).toBe("require-base64");

        // 3. 火山方舟图片协议：强制内联 Base64
        const arkConfig: AiConfig = {
            ...baseConfig,
            interfaceType: "volcengine-ark-image",
            model: "doubao-image-general-v1",
        };
        expect(detectUpstreamImageRequirement(arkConfig)).toBe("require-base64");

        // 4. 要求公网 URL 的通道 (如 agnes-image 或 requiresPublicMediaUrls)
        const publicUrlConfig: AiConfig = {
            ...baseConfig,
            interfaceType: "agnes-image",
            model: "agnes-image-v1",
        };
        expect(detectUpstreamImageRequirement(publicUrlConfig)).toBe("require-url");

        // 5. 自适应通道 (OpenAI chat-completion / NewAPI / Claude 等)：默认 auto
        const chatCompletionConfig: AiConfig = {
            ...baseConfig,
            interfaceType: "chat-completion",
            model: "gpt-4o",
        };
        expect(detectUpstreamImageRequirement(chatCompletionConfig)).toBe("auto");

        const claudeConfig: AiConfig = {
            ...baseConfig,
            interfaceType: "claude-api",
            model: "claude-3-5-sonnet",
        };
        expect(detectUpstreamImageRequirement(claudeConfig)).toBe("auto");
    });

    test("resolveUpstreamImageReference 在 auto 模式下保留合规公网 URL（避免 Base64 膨胀）", async () => {
        const publicUrl = "https://images.example.com/product-catalog/sku-10086.jpg";
        const result = await resolveUpstreamImageReference(
            { url: publicUrl, name: "商品图.jpg" },
            baseConfig,
            { requirement: "auto" }
        );
        expect(result).toBe(publicUrl);
    });

    test("resolveUpstreamImageReference 保留已存在的标准 image DataURL", async () => {
        const standardDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        const result = await resolveUpstreamImageReference(
            { dataUrl: standardDataUrl, name: "pixel.png" },
            baseConfig,
            { requirement: "auto" }
        );
        expect(result).toBe(standardDataUrl);
    });

    test("resolveUpstreamImageReference 在 require-url 模式下对非公网资源抛出明确引导错误", async () => {
        await expect(
            resolveUpstreamImageReference(
                { url: "/api/resources/test/file", name: "本地商品图.jpg" },
                baseConfig,
                { requirement: "require-url", label: "电商商品图" }
            )
        ).rejects.toThrow("电商商品图需要公网可达的 URL 地址");
    });
});

describe("电商套图规划容错与状态机规范 (Detail Set Planning & Store Governance)", () => {
    test("normalizeDetailSetPurpose 准确归一化大模型输出的无空格、简称及子项模块名", async () => {
        const { normalizeDetailSetPurpose } = await import(
            "../src/extensions/image-workbench-skills/core/detail-set-planner"
        );

        // 1. 完全精确全称
        expect(normalizeDetailSetPurpose("首图 / 主视觉")).toBe("首图 / 主视觉");
        expect(normalizeDetailSetPurpose("场景图 / 使用")).toBe("场景图 / 使用");

        // 2. 去空格匹配（LLM 高频输出格式）
        expect(normalizeDetailSetPurpose("首图/主视觉")).toBe("首图 / 主视觉");
        expect(normalizeDetailSetPurpose("卖点图/功效")).toBe("卖点图 / 功效");
        expect(normalizeDetailSetPurpose("细节图/材质")).toBe("细节图 / 材质");

        // 3. 简称短名匹配
        expect(normalizeDetailSetPurpose("首图")).toBe("首图 / 主视觉");
        expect(normalizeDetailSetPurpose("场景图")).toBe("场景图 / 使用");
        expect(normalizeDetailSetPurpose("包装图")).toBe("包装图 / 到手");
        expect(normalizeDetailSetPurpose("收尾图")).toBe("收尾图 / CTA");

        // 4. 职责分项匹配
        expect(normalizeDetailSetPurpose("主视觉")).toBe("首图 / 主视觉");
        expect(normalizeDetailSetPurpose("材质特写")).toBe("细节图 / 材质");

        // 5. 非法名称安全兜底返回空字符串
        expect(normalizeDetailSetPurpose("未知不存在模块")).toBe("");
        expect(normalizeDetailSetPurpose("")).toBe("");
    });

    test("parseDetailSetPlanJson 在面对大模型无空格或简称输出时成功解析不丢行", async () => {
        const { parseDetailSetPlanJson } = await import(
            "../src/extensions/image-workbench-skills/core/detail-set-planner"
        );

        const mockLlmJson = JSON.stringify({
            analysis: {
                productName: "天然真丝眼罩",
                sellingPoints: ["100% 桑蚕丝", "双面遮光"],
            },
            rows: [
                { module_purpose: "首图/主视觉", title: "主视觉封面", prompt: "真丝眼罩特写", aspect_ratio: "3:4" },
                { module_purpose: "场景图", title: "卧室睡前佩戴", prompt: "温馨卧室床头佩戴", aspect_ratio: "3:4" },
                { module_purpose: "卖点图 / 功效", title: "透气遮光", prompt: "眼罩面料微距", aspect_ratio: "3:4" },
            ],
        });

        const plan = parseDetailSetPlanJson(mockLlmJson, {
            selections: {
                "首图 / 主视觉": 1,
                "场景图 / 使用": 1,
                "卖点图 / 功效": 1,
            },
            aspectRatio: "3:4",
            outputLanguage: "zh",
            planId: "test-plan-1",
            createdAt: Date.now(),
            extraInstruction: "",
            productSafe: true,
            resolution: "1K",
            outputFormat: "PNG",
        });

        expect(plan.rows.length).toBe(3);
        expect(plan.rows[0].modulePurpose).toBe("首图 / 主视觉");
        expect(plan.rows[1].modulePurpose).toBe("场景图 / 使用");
        expect(plan.rows[2].modulePurpose).toBe("卖点图 / 功效");
    });

    test("useDetailSetStore.resetWorkflow 正向重置套图所有状态至初始 create 态", async () => {
        const { useDetailSetStore } = await import(
            "../src/extensions/image-workbench-skills/stores/use-detail-set-store"
        );

        // 先模拟进入 review 态并注入数据
        useDetailSetStore.setState({
            phase: "review",
            planningStage: 2,
            plan: {
                planId: "dirty-plan",
                createdAt: Date.now(),
                productName: "旧商品",
                price: "199",
                config: { addText: true, outputLanguage: "zh", aspectRatio: "3:4", resolution: "1K", outputFormat: "PNG", productSafe: true },
                rows: [],
            },
            activePlanId: "dirty-plan",
        });

        // 调用重置
        useDetailSetStore.getState().resetWorkflow();

        const state = useDetailSetStore.getState();
        expect(state.phase).toBe("create");
        expect(state.plan).toBeNull();
        expect(state.activePlanId).toBeNull();
        expect(state.planningStage).toBe(0);
        expect(state.planError).toBeUndefined();
    });

    test("buildRowFinalPrompt 正确注入品类光学质感、排版留白安全区、摄影光学系统与避坑词库", async () => {
        const { buildRowFinalPrompt } = await import(
            "../src/extensions/image-workbench-skills/core/detail-set-planner"
        );

        // 1. 美妆品类测试
        const beautyPrompt = buildRowFinalPrompt({
            row: {
                seq: 1,
                modulePurpose: "首图 / 主视觉",
                title: "水润修护主图",
                copy: "深层滋润 透现光采",
                visualDescription: "精华液玻璃瓶立于微水泥台面",
                finalPrompt: "顶级商业美妆静物摄影。精华液玻璃瓶特写。",
                aspectRatio: "3:4",
                status: "planned",
            },
            plan: {
                config: {
                    addText: true,
                    outputLanguage: "zh",
                    aspectRatio: "3:4",
                    resolution: "1K",
                    outputFormat: "PNG",
                    productSafe: true,
                },
                extraInstruction: "",
                analysis: {
                    category: "beauty",
                    sellingPoints: ["三重多肽"],
                },
            },
            styleLook: "晨光清透原木风",
        });

        // 断言包含美妆专属光学系统与英文图纸
        expect(beautyPrompt).toContain("commercial cosmetic macro photography");
        expect(beautyPrompt).toContain("softbox lighting");
        // 断言包含中文排版安全区与文案
        expect(beautyPrompt).toContain("预留专业电商留白排版安全区");
        expect(beautyPrompt).toContain("深层滋润 透现光采");
        // 断言包含风格与锁品约束
        expect(beautyPrompt).toContain("Style and aesthetic: 晨光清透原木风");
        expect(beautyPrompt).toContain("Preserve exact product packaging");
        // 断言严禁在正向提示词中注入中文否定词
        expect(beautyPrompt).not.toContain("悬浮漂浮无阴影");
        expect(beautyPrompt).not.toContain("塑料廉价感");
        expect(beautyPrompt).not.toContain("高光死白过曝");

        // 2. 数码品类无文字测试
        const digitalPrompt = buildRowFinalPrompt({
            row: {
                seq: 2,
                modulePurpose: "结构图 / 功能",
                title: "内部声学架构",
                visualDescription: "耳机精密内部单元拆解",
                finalPrompt: "无线耳机精密单元透视爆炸图。",
                aspectRatio: "3:4",
                status: "planned",
            },
            plan: {
                config: {
                    addText: false,
                    outputLanguage: "none",
                    aspectRatio: "3:4",
                    resolution: "1K",
                    outputFormat: "PNG",
                    productSafe: false,
                },
                extraInstruction: "",
                analysis: {
                    category: "digital",
                },
            },
        });

        expect(digitalPrompt).toContain("futuristic tech studio lighting");
        expect(digitalPrompt).toContain("anodized aluminum");
        expect(digitalPrompt).toContain("【排版要求】纯净画面，不含任何文字");

        // 3. 食品品类测试
        const foodPrompt = buildRowFinalPrompt({
            row: {
                seq: 3,
                modulePurpose: "场景图 / 使用",
                title: "餐桌美味瞬间",
                copy: "新鲜温润 现烤醇香",
                finalPrompt: "现烤面包自然光斑静物。",
                aspectRatio: "1:1",
                status: "planned",
            },
            plan: {
                config: {
                    addText: true,
                    outputLanguage: "zh",
                    aspectRatio: "1:1",
                    resolution: "1K",
                    outputFormat: "PNG",
                    productSafe: true,
                },
                extraInstruction: "",
                analysis: {
                    category: "food",
                },
            },
        });
        expect(foodPrompt).toContain("appetizing golden top-side lighting");
        expect(foodPrompt).toContain("新鲜温润 现烤醇香");
    });

    test("buildDetailSetPlanMessages 支持传入最多 8 张商品图输入至 Vision 分析", async () => {
        const { buildDetailSetPlanMessages } = await import(
            "../src/extensions/image-workbench-skills/core/detail-set-planner"
        );

        const mockImages = Array.from({ length: 8 }, (_, i) => ({
            id: `img-${i + 1}`,
            name: `angle-${i + 1}.png`,
            dataUrl: `data:image/png;base64,mock${i + 1}`,
        }));

        const mockConfig = {
            baseUrl: "https://api.openai.com/v1",
            apiKey: "sk-test",
            model: "gpt-4o",
        } as any;

        const { messages } = buildDetailSetPlanMessages({
            config: mockConfig,
            selections: { "首图 / 主视觉": 1 },
            outputLanguage: "zh",
            aspectRatio: "3:4",
            resolution: "1K",
            outputFormat: "PNG",
            productSafe: true,
            stylePresetId: null,
            extraInstruction: "",
            productImages: mockImages,
        });

        const userMsg = messages[1];
        expect(Array.isArray(userMsg.content)).toBe(true);
        if (Array.isArray(userMsg.content)) {
            const imageItems = userMsg.content.filter((c) => c.type === "image_url");
            expect(imageItems.length).toBe(8);
        }
    });

    test("stripJsonFence 成功剔除 <think> 思考标签与 Markdown 围栏", async () => {
        const { stripJsonFence } = await import(
            "../src/extensions/image-workbench-skills/core/detail-set-planner"
        );

        const rawWithThink = `
<think>
这里是模型的内心思考过程：分析商品卖点...
需要规划 3 张图：首图、卖点图、细节图。
</think>
\`\`\`json
{
    "analysis": { "productName": "纯棉T恤" },
    "rows": [
        { "module_purpose": "首图", "title": "T恤特写" }
    ]
}
\`\`\`
`;
        const stripped = stripJsonFence(rawWithThink);
        expect(stripped).not.toContain("<think>");
        expect(stripped).not.toContain("内心思考过程");
        expect(stripped.startsWith("{")).toBe(true);
        expect(stripped.endsWith("}")).toBe(true);
    });

    test("tryParseJsonWithRepair 成功修复因 Token 截断导致的未闭合 JSON 结构", async () => {
        const { tryParseJsonWithRepair } = await import(
            "../src/extensions/image-workbench-skills/core/detail-set-planner"
        );

        // 模拟大模型输出在第 2 个对象中间被截断
        const truncatedJson = `{"analysis": {"productName": "测试商品"}, "rows": [{"module_purpose": "首图", "title": "首图标题"}, {"module_purpose": "场景图", "title": "场景`;
        const parsed = tryParseJsonWithRepair(truncatedJson);
        expect(parsed).toBeDefined();
        expect(parsed.analysis.productName).toBe("测试商品");
        expect(Array.isArray(parsed.rows)).toBe(true);
        expect(parsed.rows.length).toBe(1);
        expect(parsed.rows[0].module_purpose).toBe("首图");
    });

    test("parseDetailSetPlanJson 自适应对齐行数并提供商业级价格兜底", async () => {
        const { parseDetailSetPlanJson } = await import(
            "../src/extensions/image-workbench-skills/core/detail-set-planner"
        );

        // 用户选了 3 张（首图 1，场景图 2），但模型漏输出了第 2 张场景图（仅输出 2 行）
        const mockShortJson = JSON.stringify({
            analysis: { productName: "智能手表" },
            rows: [
                { module_purpose: "首图", title: "手表正面" },
                { module_purpose: "场景图", title: "晨跑佩戴" },
            ],
        });

        const plan = parseDetailSetPlanJson(mockShortJson, {
            selections: {
                "首图 / 主视觉": 1,
                "场景图 / 使用": 2,
            },
            aspectRatio: "3:4",
            outputLanguage: "zh",
            planId: "test-plan-short",
            createdAt: Date.now(),
            extraInstruction: "",
            productSafe: true,
            resolution: "1K",
            outputFormat: "PNG",
        });

        // 自动自愈补齐缺失的场景图行，总数必须稳定等于 3
        expect(plan.rows.length).toBe(3);
        expect(plan.rows[0].modulePurpose).toBe("首图 / 主视觉");
        expect(plan.rows[1].modulePurpose).toBe("场景图 / 使用");
        expect(plan.rows[2].modulePurpose).toBe("场景图 / 使用");
        expect(plan.price).toBe("99.00");
    });
});


