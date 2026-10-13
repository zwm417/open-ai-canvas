import { describe, expect, it } from "bun:test";
import {
    buildFallbackPlanRows,
    buildRowFinalPrompt,
    isVisionCapableModel,
    normalizeDetailSetPurpose,
    parseDetailSetPlanJson,
    resolveVisionPlannerModel,
    stripJsonFence,
    synthesizeDynamicAdCopy,
    tryParseJsonWithRepair,
} from "../src/extensions/image-workbench-skills/core/detail-set-planner";
import {
    checkDetailSetAdCompliance,
    sanitizeDetailSetAdText,
} from "../src/extensions/image-workbench-skills/core/detail-set-compliance";
import {
    DETAIL_SET_CATEGORY_PIPELINES,
    DETAIL_SET_CATEGORY_TEMPLATES,
    DETAIL_SET_RECIPE_GENRES,
    DETAIL_SET_ROW_TEMPLATES,
    getDetailSetTemplate,
} from "../src/extensions/image-workbench-skills/catalog/detail-set-templates";
import { DETAIL_SET_MODULES } from "../src/extensions/image-workbench-skills/types/detail-set";

describe("电商套图规划引擎与双层 Prompt 架构 (Detail Set Planner & Dual-Layer Architecture)", () => {
    describe("多模态 Vision 模型自动路由与识别 (Vision Model Resolution)", () => {
        it("精确识别具备视觉理解能力的多模态模型标识", () => {
            expect(isVisionCapableModel("gpt-4o")).toBe(true);
            expect(isVisionCapableModel("gpt-4o-mini")).toBe(true);
            expect(isVisionCapableModel("claude-3-5-sonnet-20241022")).toBe(true);
            expect(isVisionCapableModel("gemini-1.5-pro")).toBe(true);
            expect(isVisionCapableModel("gemini-2.0-flash")).toBe(true);
            expect(isVisionCapableModel("qwen-vl-max")).toBe(true);
            expect(isVisionCapableModel("deepseek-chat")).toBe(false);
            expect(isVisionCapableModel("text-davinci-003")).toBe(false);
        });

        it("优先调度可用模型池中的 Vision 多模态模型，防止纯文本模型失明", () => {
            const configWithVision = {
                model: "deepseek-chat",
                textModel: "deepseek-chat",
                availableModels: ["deepseek-chat", "gpt-4o-mini", "dall-e-3"],
            } as any;
            expect(resolveVisionPlannerModel(configWithVision)).toBe("gpt-4o-mini");

            const configTextOnly = {
                model: "deepseek-chat",
                textModel: "deepseek-chat",
                availableModels: ["deepseek-chat"],
            } as any;
            // 降级回退当前配置模型
            expect(resolveVisionPlannerModel(configTextOnly)).toBe("deepseek-chat");
        });
    });

    describe("五大品类专属模板与动态管线 (Category-Tailored Templates & Pipelines)", () => {
        it("各品类模板针对性输出专属光学质感与叙事结构，防止品类漂移", () => {
            const fashionTpl = getDetailSetTemplate("首图 / 主视觉", "fashion");
            expect(fashionTpl.title).toContain("型格");
            expect(fashionTpl.visual).toContain("服饰鞋包");
            expect(fashionTpl.prompt).toContain("fashion");
            expect(fashionTpl.prompt).not.toContain("真空包装");

            const digitalTpl = getDetailSetTemplate("首图 / 主视觉", "digital");
            expect(digitalTpl.title).toContain("科技");
            expect(digitalTpl.prompt).toContain("electronic");

            const foodTpl = getDetailSetTemplate("首图 / 主视觉", "food");
            expect(foodTpl.title).toContain("食欲");
            expect(foodTpl.prompt).toContain("appetizing");

            const homeTpl = getDetailSetTemplate("首图 / 主视觉", "home");
            expect(homeTpl.title).toContain("空间");
            expect(homeTpl.prompt).toContain("home");

            const beautyTpl = getDetailSetTemplate("首图 / 主视觉", "beauty");
            expect(beautyTpl.title).toContain("奢华");
            expect(beautyTpl.prompt).toContain("skincare");
        });
    });
    describe("广告法违禁词审查与自动脱敏 (Ad Compliance & Sanitization)", () => {
        it("正确检测绝对化用语、医疗功效、虚假紧迫用词", () => {
            const riskyText = "全网第一顶级精华液，三天见效彻底根除斑点，最后一天马上涨价！";
            const violations = checkDetailSetAdCompliance(riskyText);
            expect(violations.length).toBeGreaterThanOrEqual(4);
            const terms = violations.map((v) => v.term);
            expect(terms).toContain("全网第一");
            expect(terms).toContain("顶级");
            expect(terms).toContain("三天见效");
            expect(terms).toContain("最后一天");
        });

        it("自动将违禁词安全重写为高转化合规商业用语", () => {
            const raw = "全网第一顶级面霜，百分百根治干燥，最后一天抢购";
            const sanitized = sanitizeDetailSetAdText(raw);
            expect(sanitized).not.toContain("全网第一");
            expect(sanitized).not.toContain("顶级");
            expect(sanitized).not.toContain("根治");
            expect(sanitized).not.toContain("最后一天");
            expect(sanitized).toContain("领航之作");
            expect(sanitized).toContain("高阶");
            expect(sanitized).toContain("深层修护");
            expect(sanitized).toContain("限时特惠");
        });
    });

    describe("模块名称自适应归一化 (Purpose Normalization)", () => {
        it("能够容错映射空格、短名与子项名称", () => {
            expect(normalizeDetailSetPurpose("首图 / 主视觉")).toBe("首图 / 主视觉");
            expect(normalizeDetailSetPurpose("首图/主视觉")).toBe("首图 / 主视觉");
            expect(normalizeDetailSetPurpose("首图")).toBe("首图 / 主视觉");
            expect(normalizeDetailSetPurpose("场景图")).toBe("场景图 / 使用");
            expect(normalizeDetailSetPurpose("功效")).toBe("卖点图 / 功效");
            expect(normalizeDetailSetPurpose("材质")).toBe("细节图 / 材质");
            expect(normalizeDetailSetPurpose("到手")).toBe("包装图 / 到手");
            expect(normalizeDetailSetPurpose("未知模块")).toBe("");
        });
    });

    describe("规划输出 JSON 解析与双层 Prompt 提取 (parseDetailSetPlanJson)", () => {
        it("正确提取 Layer 1 视觉指导与 Layer 2 纯净英文提示词，并对文案进行广告法脱敏", () => {
            const mockLlmOutput = JSON.stringify({
                analysis: {
                    productName: "双萃紧致修护精华",
                    category: "beauty",
                    sellingPoints: ["核心成分雪绒花精萃", "72h长效锁水", "微囊渗透科技"],
                    targetAudience: "熬夜轻熟龄人群",
                },
                rows: [
                    {
                        module_purpose: "首图 / 主视觉",
                        title: "全网第一主视觉",
                        copy: "顶级修护 · 100%锁水",
                        visual_description: "纯白底 #FFFFFF，产品居中占 38%，柔光箱漫反射高光，底部 5% 不透明度接触阴影",
                        prompt: "Commercial studio hero packshot, pure white background #FFFFFF, product taking 38% frame in center, overhead softbox diffused lighting, 5% contact shadow, 85mm lens.",
                        aspect_ratio: "9:16",
                    },
                    {
                        module_purpose: "场景图 / 使用",
                        title: "晨间唤醒场景",
                        copy: "晨间一泵 · 焕亮好气色",
                        visual_description: "清晨明亮洗漱台，大理石台面水珠，自然空气感 f/2.8",
                        prompt: "Modern bathroom vanity scene, product on white marble tray, fresh morning 5500K daylight, shallow depth of field f/2.8.",
                        aspect_ratio: "9:16",
                    },
                ],
            });

            const plan = parseDetailSetPlanJson(mockLlmOutput, {
                selections: {
                    "首图 / 主视觉": 1,
                    "场景图 / 使用": 1,
                },
                aspectRatio: "9:16",
                outputLanguage: "zh",
                planId: "test_plan_001",
                createdAt: Date.now(),
                extraInstruction: "",
                productSafe: true,
                resolution: "1024x1824",
                outputFormat: "webp",
            });

            expect(plan.rows).toHaveLength(2);

            // Layer 1 提取验证
            expect(plan.rows[0].visualDescription).toContain("纯白底 #FFFFFF");
            // 中英双层结构验证（包含中文排版与主体指引 + 英文生图图纸）
            expect(plan.rows[0].finalPrompt).toContain("【画面主体与场景】");
            expect(plan.rows[0].finalPrompt).toContain("【图内排版文案】");
            expect(plan.rows[0].finalPrompt).toContain("主标题：“高阶修护”");
            expect(plan.rows[0].finalPrompt).toContain("副文案：“高纯度锁水”");
            expect(plan.rows[0].finalPrompt).not.toContain("领航之作主视觉");
            expect(plan.rows[0].finalPrompt).toContain("Commercial studio hero packshot");
            // 广告法脱敏验证
            expect(plan.rows[0].title).toBe("领航之作主视觉");
            expect(plan.rows[0].copy).toBe("高阶修护 · 高纯度锁水");
        });

        it("当模型返回行数不足时，自动通过 12 大模块模板库智能自愈对齐行数", () => {
            const incompleteOutput = JSON.stringify({
                analysis: { productName: "智能降噪耳机", category: "digital" },
                rows: [
                    {
                        module_purpose: "首图",
                        title: "耳机主图",
                        copy: "静谧声学",
                        prompt: "Commercial digital packshot of headphones on dark tech background.",
                    },
                ],
            });

            const plan = parseDetailSetPlanJson(incompleteOutput, {
                selections: {
                    "首图 / 主视觉": 1,
                    "结构图 / 功能": 1,
                },
                aspectRatio: "9:16",
                outputLanguage: "zh",
                planId: "test_plan_002",
                createdAt: Date.now(),
                extraInstruction: "",
                productSafe: true,
                resolution: "1024x1824",
                outputFormat: "webp",
            });

            // 预期自动补全了结构图模块
            expect(plan.rows).toHaveLength(2);
            expect(plan.rows[1].modulePurpose).toBe("结构图 / 功能");
            expect(plan.rows[1].visualDescription).toBeDefined();
            expect(plan.rows[1].finalPrompt).toContain("3D precision exploded view");
            expect(plan.rows[1].finalPrompt).toContain("【画面主体与场景】");
        });

        it("上传非美妆商品（如运动鞋、冲锋衣）时，正确识别商品名并不产生美妆词汇泄露", () => {
            const mockSneakerOutput = JSON.stringify({
                analysis: {
                    productName: "全掌气垫运动跑步鞋",
                    category: "fashion",
                    sellingPoints: ["全掌氮气气垫", "高透气飞织鞋面", "耐磨防滑橡胶大底"],
                    targetAudience: "马拉松与日常跑步爱好者",
                },
                rows: [
                    {
                        module_purpose: "首图 / 主视觉",
                        title: "全掌气垫跑步鞋主图",
                        copy: "轻盈缓震 · 动力回弹",
                        visual_description: "纯白极简底，跑步鞋呈 3/4 侧视悬浮，突出气垫与飞织纹理",
                        prompt: "Commercial studio hero packshot of running shoes, pure white background #FFFFFF, crisp lighting, 85mm lens.",
                        aspect_ratio: "9:16",
                    },
                ],
            });

            const plan = parseDetailSetPlanJson(mockSneakerOutput, {
                selections: { "首图 / 主视觉": 1 },
                aspectRatio: "9:16",
                outputLanguage: "zh",
                planId: "sneaker_plan_001",
                createdAt: Date.now(),
                extraInstruction: "",
                productSafe: true,
                resolution: "1K",
                outputFormat: "PNG",
                productImages: [{ name: "耐克全掌气垫跑步鞋_黑白.png" }],
            });

            expect(plan.productName).toBe("全掌气垫运动跑步鞋");
            expect(plan.rows[0].title).toBe("全掌气垫跑步鞋主图");
            expect(plan.rows[0].copy).toBe("轻盈缓震 · 动力回弹");
            // 提示词必须包含中文主体与排版文案（文案由 copy 生成，严禁将 title 镜头说明写进排版文案）
            expect(plan.rows[0].finalPrompt).toContain("【画面主体与场景】");
            expect(plan.rows[0].finalPrompt).toContain("主标题：“轻盈缓震”");
            expect(plan.rows[0].finalPrompt).toContain("副文案：“动力回弹”");
            expect(plan.rows[0].finalPrompt).not.toContain("主标题：“全掌气垫跑步鞋主图”");
            // 严禁产生美妆词汇
            expect(plan.rows[0].finalPrompt).not.toContain("紧致修护");
            expect(plan.rows[0].finalPrompt).not.toContain("真空锁鲜");
            expect(plan.rows[0].finalPrompt).not.toContain("冰淇淋质地");
        });
    });

    describe("阶段 2 逐行提示词高信噪比编译 (buildRowFinalPrompt)", () => {
        const mockPlanSnapshot = {
            config: {
                addText: true,
                outputLanguage: "zh",
                aspectRatio: "9:16",
                resolution: "1024x1824",
                outputFormat: "webp",
                productSafe: true,
            },
            extraInstruction: "保留金色按压喷头细节",
            analysis: {
                category: "beauty",
                productName: "美白原液",
            },
        };

        it("组装结果包含核心中文排版指令、核心英文图纸、锁品一致性锚点、客户补充要求与画幅标记", () => {
            const compiled = buildRowFinalPrompt({
                row: {
                    seq: 1,
                    modulePurpose: "首图 / 主视觉",
                    title: "影棚主图",
                    copy: "净白焕肤 · 柔润光泽",
                    visualDescription: "纯白底高质感构图",
                    finalPrompt: "Commercial studio hero packshot, pure white background #FFFFFF, product taking 38% frame.",
                    aspectRatio: "9:16",
                    status: "planned",
                },
                plan: mockPlanSnapshot,
                styleLook: "高级影棚布光，柔和顶光与轮廓光",
            });

            // 1. 中文商业视觉与排版指令（文案源于 copy，镜头说明 title 绝不印在图上）
            expect(compiled).toContain("【画面主体与场景】");
            expect(compiled).toContain("【图内排版文案】");
            expect(compiled).toContain("主标题：“净白焕肤”");
            expect(compiled).toContain("副文案：“柔润光泽”");
            expect(compiled).not.toContain("主标题：“影棚主图”");
            // 2. 核心图纸
            expect(compiled).toContain("Commercial studio hero packshot, pure white background #FFFFFF");
            // 3. 锁品刚性锚点
            expect(compiled).toContain("Preserve exact product packaging, brand logo, label typography, and physical structural form factor without alteration.");
            // 4. 画幅
            expect(compiled).toContain("--ar 9:16");
            // 5. 补充指令
            expect(compiled).toContain("Client directive: 保留金色按压喷头细节.");
            // 6. 商业红线：绝不向正向提示词中注入中文负面否定词
            expect(compiled).not.toContain("杜绝塑料感");
            expect(compiled).not.toContain("规避瑕疵");
            expect(compiled).not.toContain("悬浮漂浮无阴影");
        });

        it("当用户显式微调提示词时 (isEdited=true)，商业所见即所发，绝对严禁后台正则覆写", () => {
            const customUserPrompt = "【画面主体与场景】自定义商业置景，艺术微光\n【图内排版文案】主标题：“用户手打文案”，顶级视觉\n【摄影图纸】Custom 8k studio shot.";
            const compiled = buildRowFinalPrompt({
                row: {
                    seq: 1,
                    modulePurpose: "首图 / 主视觉",
                    title: "极简悬浮质感首图",
                    copy: "净油去污",
                    finalPrompt: customUserPrompt,
                    aspectRatio: "9:16",
                    status: "planned",
                    isEdited: true,
                },
                plan: mockPlanSnapshot,
            });

            expect(compiled).toContain("主标题：“用户手打文案”");
            expect(compiled).not.toContain("极简悬浮质感首图");
            expect(compiled).not.toContain("净油去污");
        });

        it("当提示词已自带 --ar 参数时不重复添加", () => {
            const compiled = buildRowFinalPrompt({
                row: {
                    seq: 1,
                    modulePurpose: "首图 / 主视觉",
                    finalPrompt: "Product photography in morning daylight. --ar 9:16",
                    aspectRatio: "9:16",
                    status: "planned",
                },
                plan: {
                    ...mockPlanSnapshot,
                    config: { ...mockPlanSnapshot.config, productSafe: false },
                    extraInstruction: "",
                },
            });

            const arMatches = compiled.match(/--ar/g) || [];
            expect(arMatches.length).toBe(1);
        });
    });

    describe("降级模板与 400+ 配方底座 (buildFallbackPlanRows & Catalog)", () => {
        it("12 大核心模块均具备双层结构（中文场景与图内排版指引 + 纯正英文工业生图图纸）", () => {
            for (const mod of DETAIL_SET_MODULES) {
                const templates = DETAIL_SET_ROW_TEMPLATES[mod.purpose];
                expect(templates).toBeDefined();
                expect(templates.length).toBeGreaterThan(0);
                for (const tpl of templates) {
                    expect(tpl.title).toBeTruthy();
                    expect(tpl.visual).toBeTruthy();
                    expect(tpl.prompt).toBeTruthy();
                    // 确认 prompt 包含中文指引与英文生图图纸双层结构
                    expect(tpl.prompt).toContain("【画面主体与场景】");
                    expect(tpl.prompt).toContain("【图内排版文案】");
                    expect(tpl.prompt).toContain("【摄影图纸】");
                }
            }
        });

        it("5 大品类动态刚性管线与 6 大超级爆款配方库分类规范完整导出", () => {
            expect(Object.keys(DETAIL_SET_CATEGORY_PIPELINES)).toEqual(["beauty", "fashion", "food", "digital", "home"]);
            for (const [key, spec] of Object.entries(DETAIL_SET_CATEGORY_PIPELINES)) {
                expect(spec.category).toBe(key);
                expect(spec.englishOptics).toBeTruthy();
                expect(spec.rigidRules.length).toBeGreaterThanOrEqual(3);
            }
            expect(DETAIL_SET_RECIPE_GENRES.length).toBe(6);
        });

        it("本地降级路径生成合规且带有双层 Prompt 的模板行", () => {
            const fallbackRows = buildFallbackPlanRows(
                {
                    "首图 / 主视觉": 1,
                    "细节图 / 材质": 1,
                },
                "9:16",
                true,
                "轻便防水冲锋衣",
            );

            expect(fallbackRows).toHaveLength(2);
            expect(fallbackRows[0].modulePurpose).toBe("首图 / 主视觉");
            expect(fallbackRows[0].title).toContain("轻便防水冲锋衣");
            expect(fallbackRows[0].finalPrompt).toContain("【画面主体与场景】");
            expect(fallbackRows[0].finalPrompt).toContain("【图内排版文案】");
            expect(fallbackRows[0].finalPrompt).toContain("Commercial studio hero");
            expect(fallbackRows[1].modulePurpose).toBe("细节图 / 材质");
            expect(fallbackRows[1].finalPrompt).toContain("Extreme macro");
        });

        it("本地降级路径支持指定品类并生成品类专属双层模板行", () => {
            const digitalRows = buildFallbackPlanRows(
                { "首图 / 主视觉": 1 },
                "9:16",
                true,
                "降噪蓝牙耳机",
                "digital",
            );
            expect(digitalRows[0].finalPrompt).toContain("consumer electronics");
            expect(digitalRows[0].finalPrompt).toContain("【画面主体与场景】");
            expect(digitalRows[0].finalPrompt).toContain("【图内排版文案】");

            const foodRows = buildFallbackPlanRows(
                { "首图 / 主视觉": 1 },
                "9:16",
                true,
                "有机高山绿茶",
                "food",
            );
            expect(foodRows[0].finalPrompt).toContain("appetizing");
            expect(foodRows[0].finalPrompt).not.toContain("electronics");
        });

        it("透传用户预设商品名、品类与核心卖点，在缺失 analysis 时完整兜底保全", () => {
            const rawWithoutAnalysis = JSON.stringify({
                rows: [
                    {
                        module_purpose: "首图 / 主视觉",
                        title: "主图展示",
                        prompt: "Studio shot of product.",
                    },
                ],
            });

            const plan = parseDetailSetPlanJson(rawWithoutAnalysis, {
                selections: { "首图 / 主视觉": 1 },
                aspectRatio: "9:16",
                outputLanguage: "zh",
                planId: "fallback_meta_plan",
                createdAt: Date.now(),
                extraInstruction: "",
                productSafe: true,
                resolution: "1K",
                outputFormat: "PNG",
                productName: "双饮保温杯",
                category: "home",
                keySellingPoints: "316不锈钢 12小时锁温",
            });

            expect(plan.productName).toBe("双饮保温杯");
            expect(plan.category).toBe("home");
            expect(plan.analysis?.sellingPoints).toContain("316不锈钢");
            expect(plan.analysis?.sellingPoints).toContain("12小时锁温");
        });
    });

    describe("大模型实际响应多态字段解构与零丢失保障 (Polymorphic Deconstruction & Zero-Loss Guardrails)", () => {
        it("正确解析真实大模型返回的多态字段（module, shotTitle, 对象式 copywriting, root 级 productCategory），严禁回退为服饰模板", () => {
            const geminiRealOutput = JSON.stringify({
                productName: "创意复古磁带纸巾盒",
                productCategory: "home",
                rows: [
                    {
                        module: "首图 / 主视觉",
                        shotTitle: "视觉全景",
                        copywriting: {
                            mainTitle: "复古潮流，生活仪式感",
                            subTitle: "磁带造型创意纸巾盒",
                        },
                        visualDescription: "纯净浅灰桌面，复古磁带造型纸巾盒居中放置，柔和晨光漫射，纸巾从磁带顶部自然露出",
                        prompt: "Commercial studio product photography of vintage cassette tape style tissue box on light gray desk, soft morning window light, high details.",
                    },
                    {
                        module: "场景图 / 使用",
                        shotTitle: "客厅摆放场景",
                        copywriting: {
                            mainTitle: "点缀温馨空间",
                            subTitle: "客厅茶几吸睛焦点",
                        },
                        visualDescription: "现代简约原木茶几，磁带纸巾盒与绿植杂志和谐搭配，生活气息浓厚",
                        prompt: "Lifestyle scene of cassette tape tissue box on wooden coffee table next to magazines and small potted plant, warm ambient daylight.",
                    },
                ],
            });

            const plan = parseDetailSetPlanJson(geminiRealOutput, {
                selections: { "首图 / 主视觉": 1, "场景图 / 使用": 1 },
                aspectRatio: "3:4",
                outputLanguage: "zh",
                planId: "gemini_real_test",
                createdAt: Date.now(),
                extraInstruction: "",
                productSafe: true,
                resolution: "1K",
                outputFormat: "PNG",
            });

            // 1. 品名与品类精准继承自大模型，品类严禁被错误判定为 fashion
            expect(plan.productName).toBe("创意复古磁带纸巾盒");
            expect(plan.category).toBe("home");

            // 2. 真实行 100% 留存，严禁丢弃行并被硬编码服饰模板覆盖
            expect(plan.rows.length).toBe(2);
            expect(plan.rows[0].modulePurpose).toBe("首图 / 主视觉");
            expect(plan.rows[0].title).toBe("视觉全景");
            expect(plan.rows[0].copy).toBe("复古潮流，生活仪式感 · 磁带造型创意纸巾盒");
            expect(plan.rows[0].visualDescription).toContain("复古磁带造型纸巾盒");
            expect(plan.rows[0].finalPrompt).toContain("vintage cassette tape");
            expect(plan.rows[0].finalPrompt).not.toContain("高阶轮廓型格主图");
            expect(plan.rows[0].finalPrompt).not.toContain("立体剪裁");

            expect(plan.rows[1].modulePurpose).toBe("场景图 / 使用");
            expect(plan.rows[1].title).toBe("客厅摆放场景");
            expect(plan.rows[1].copy).toBe("点缀温馨空间 · 客厅茶几吸睛焦点");
            expect(plan.rows[1].visualDescription).toContain("原木茶几");
            expect(plan.rows[1].finalPrompt).toContain("coffee table");
            expect(plan.rows[1].finalPrompt).not.toContain("都市通勤上身动线");
        });

        it("当模型返回非标准模块别名或自拟名称时，按选择顺序保真对齐，严禁丢弃任何真实生成行", () => {
            const rawWithCustomNames = JSON.stringify({
                productName: "透明声学机械键盘",
                category: "digital",
                rows: [
                    {
                        module: "主图展示",
                        heading: "客制化全透机身",
                        text: "客制化美学 · 晶莹通透",
                        scene: "冷白纯净台面，RGB微光透过全透PC外壳",
                        prompt: "Transparent mechanical keyboard on clean desk, RGB backlight.",
                    },
                    {
                        module: "轴体拆解",
                        heading: "精调卫星轴与消音棉",
                        text: "全键无冲 · HiFi声效",
                        scene: "轴体立体爆炸结构展开，展示内部硅胶垫与PCB板",
                        prompt: "Exploded engineering render of keyboard switches and PCB plate.",
                    },
                ],
            });

            const plan = parseDetailSetPlanJson(rawWithCustomNames, {
                selections: { "首图 / 主视觉": 1, "结构图 / 功能": 1 },
                aspectRatio: "1:1",
                outputLanguage: "zh",
                planId: "zero_loss_test",
                createdAt: Date.now(),
                extraInstruction: "",
                productSafe: true,
                resolution: "1K",
                outputFormat: "PNG",
            });

            expect(plan.rows.length).toBe(2);
            expect(plan.rows[0].title).toBe("客制化全透机身");
            expect(plan.rows[0].copy).toBe("客制化美学 · 晶莹通透");
            expect(plan.rows[0].modulePurpose).toBe("首图 / 主视觉");
            expect(plan.rows[1].title).toBe("精调卫星轴与消音棉");
            expect(plan.rows[1].copy).toBe("全键无冲 · HiFi声效");
            expect(plan.rows[1].modulePurpose).toBe("结构图 / 功能");
            expect(plan.rows[0].finalPrompt).not.toContain("高阶轮廓型格主图");
        });

        it("双向自愈契约：当模型在 JSON 顶层漏填 copy 或误填为镜头说明时，正向从 prompt 排版行自愈反向提取真实营销文案", () => {
            const rawMissingCopyInJson = JSON.stringify({
                productName: "多功能长柄清洁刷",
                category: "home",
                rows: [
                    {
                        module_purpose: "首图 / 主视觉",
                        title: "极简悬浮质感首图",
                        copy: "", // 模拟模型漏填或为空
                        visual_description: "纯净水槽台面，长柄清洁刷立体悬浮",
                        prompt: "【画面主体与场景】长柄清洁刷，纯净水槽台面居中占35%，3/4立体悬浮\n【图内排版文案】顶部留白居中排版主标题：按压出液 轻松净油，副标题：多功能长柄清洁刷。工整商业排版，预留电商留白安全区\n【摄影图纸】Commercial studio hero packshot of dish cleaning brush.",
                    },
                ],
            });

            const plan = parseDetailSetPlanJson(rawMissingCopyInJson, {
                selections: { "首图 / 主视觉": 1 },
                aspectRatio: "9:16",
                outputLanguage: "zh",
                planId: "bidirectional_self_heal_test",
                createdAt: Date.now(),
                extraInstruction: "",
                productSafe: true,
                resolution: "1K",
                outputFormat: "PNG",
            });

            expect(plan.rows.length).toBe(1);
            // 镜头说明 100% 保持为设计导航词
            expect(plan.rows[0].title).toBe("极简悬浮质感首图");
            // copy 从 prompt 成功自愈提取，绝对不为空，也绝不变成“极简悬浮质感首图”
            expect(plan.rows[0].copy).toBe("按压出液 轻松净油 · 多功能长柄清洁刷");

            // 阶段 2 编译后，排版文案由真实营销文案组成，镜头说明“极简悬浮质感首图”绝不进入图内排版文案
            const compiled = buildRowFinalPrompt({
                row: plan.rows[0],
                plan: {
                    config: plan.config,
                    productName: plan.productName,
                    extraInstruction: plan.extraInstruction,
                },
            });

            expect(compiled).toContain("按压出液 轻松净油");
            expect(compiled).toContain("多功能长柄清洁刷");
            expect(compiled).not.toContain("主标题：“极简悬浮质感首图”");
        });

        it("镜头说明自愈契约：当模型未输出 title 字段时，智能从视觉描述提炼或基于品名动态合成，绝不为空，绝非固定硬编码模板", () => {
            const rawMissingTitleInJson = JSON.stringify({
                productName: "纳米按压便携喷雾仪",
                category: "beauty",
                rows: [
                    {
                        module_purpose: "首图 / 主视觉",
                        // 模拟模型彻底漏填 title / shotTitle
                        copy: "微米水雾 · 瞬间沁润",
                        visual_description: "纯白极简底，便携喷雾仪呈3/4立体悬浮，微米级细密水雾喷涌而出",
                        prompt: "【画面主体与场景】纳米按压喷雾仪，纯白底居中立体悬浮，细腻水雾弥漫\n【图内排版文案】主标题：“微米水雾”，副文案：“瞬间沁润”，工整商业排版\n【摄影图纸】Commercial studio shot.",
                    },
                    {
                        module_purpose: "细节图 / 材质",
                        // 模拟模型未给 title，visual_description 包含微距材质特写
                        copy: "精工喷嘴 · 丝滑按压",
                        visual_description: "85mm平视微距，清晰呈现合金微孔喷嘴与防滑磨砂按键细节",
                        prompt: "Commercial macro shot.",
                    },
                ],
            });

            const plan = parseDetailSetPlanJson(rawMissingTitleInJson, {
                selections: { "首图 / 主视觉": 1, "细节图 / 材质": 1 },
                aspectRatio: "9:16",
                outputLanguage: "zh",
                planId: "title_self_heal_test",
                createdAt: Date.now(),
                extraInstruction: "",
                productSafe: true,
                resolution: "1K",
                outputFormat: "PNG",
            });

            expect(plan.rows.length).toBe(2);
            // 验证第 1 行：绝对不为空
            expect(plan.rows[0].title).toBeTruthy();
            expect(plan.rows[0].title?.length).toBeGreaterThan(0);
            // 验证并非写死模板，而是紧密结合视觉动作提炼
            expect(plan.rows[0].title).toContain("立体悬浮");
            expect(plan.rows[0].title).not.toBe("商品展示");
            expect(plan.rows[0].title).not.toBe("首图展示");

            // 验证第 2 行：绝对不为空，并提取微距细节
            expect(plan.rows[1].title).toBeTruthy();
            expect(plan.rows[1].title).toContain("微距");
            expect(plan.rows[1].title).not.toBe("细节展示");
        });

        it("动态广告文案自愈合成 (synthesizeDynamicAdCopy)：在模型漏填或彻底缺漏时，结合真实商品名与卖点动态装配，非死板模板", () => {
            // 1. 首图 + 卖点输入
            const copy1 = synthesizeDynamicAdCopy({
                productName: "高速无刷吹风机",
                modulePurpose: "首图 / 主视觉",
                category: "digital",
                sellingPoints: ["11万转高速马达", "2亿负离子柔顺"],
            });
            expect(copy1).toBeTruthy();
            expect(copy1).toContain("高速无刷吹风机");
            expect(copy1).toContain("11万转高速马达");

            // 2. 材质细节图 + 无预设卖点
            const copy2 = synthesizeDynamicAdCopy({
                productName: "羊绒保暖打底衫",
                modulePurpose: "细节图 / 材质",
                category: "fashion",
            });
            expect(copy2).toBeTruthy();
            expect(copy2).toContain("羊绒保暖打底衫");
            expect(copy2).toContain("考究选材");

            // 3. 场景图 + 家居品类
            const copy3 = synthesizeDynamicAdCopy({
                productName: "意式真皮单人沙发",
                modulePurpose: "场景图 / 使用",
                category: "home",
            });
            expect(copy3).toBeTruthy();
            expect(copy3).toContain("意式真皮单人沙发");
            expect(copy3).toContain("居家");
        });

        it("多态对象式广告文案与字段解构：支持 ad_copy, typography, headline/slogan 深度提取", () => {
            const rawWithNestedCopy = JSON.stringify({
                productName: "降噪无线头戴耳机",
                category: "digital",
                rows: [
                    {
                        module: "首图 / 主视觉",
                        title: "沉浸声学悬浮",
                        ad_copy: {
                            headline: "静享纯净原声",
                            sub_headline: "深海级主动降噪",
                        },
                        scene: "极简纯色空间，耳机悬浮展示",
                        prompt: "Headphones floating in minimalist space.",
                    },
                    {
                        module: "卖点图 / 优势",
                        title: "40小时超长续航",
                        typography: {
                            title: "持久续航",
                            subtitle: "一周一充 · 随行畅听",
                        },
                        scene: "电量光环萦绕",
                        prompt: "Battery light ring illustration.",
                    },
                ],
            });

            const plan = parseDetailSetPlanJson(rawWithNestedCopy, {
                selections: { "首图 / 主视觉": 1, "卖点图 / 优势": 1 },
                aspectRatio: "1:1",
                outputLanguage: "zh",
                planId: "nested_copy_test",
                createdAt: Date.now(),
                extraInstruction: "",
                productSafe: true,
                resolution: "1K",
                outputFormat: "PNG",
            });

            expect(plan.rows.length).toBe(2);
            expect(plan.rows[0].copy).toBe("静享纯净原声 · 深海级主动降噪");
            expect(plan.rows[1].copy).toBe("持久续航 · 一周一充 · 随行畅听");
        });
    });
});

