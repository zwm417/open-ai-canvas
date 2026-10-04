import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

describe("工作台生成交互规范与提示词隐私治理 (Workbench Generation Flow & Prompt Privacy Contract)", () => {
    const imagePagePath = path.resolve(import.meta.dir, "../src/pages/image/index.tsx");
    const videoPagePath = path.resolve(import.meta.dir, "../src/pages/video/index.tsx");
    const imageSource = fs.readFileSync(imagePagePath, "utf-8");
    const videoSource = fs.readFileSync(videoPagePath, "utf-8");

    describe("规范一：对齐画布节点，不可中止与撤销，快速释放前端锁定支持并发发起 (Irreversible Task Execution & Fast Release Contract)", () => {
        it("生图工作台：禁止出现【中止生成】或手动中止退还积分按钮，发起后快速释放前端锁定支持并发发起", () => {
            // 1. 严格禁止用户前端【中止生成】、【中止任务】选择与手动中止函数
            expect(imageSource).not.toContain("中止生成");
            expect(imageSource).not.toContain("handleCancelGeneration");

            // 2. 发起后主生成按钮在瞬时提交期锁定，并在提交后快速释放支持再次发起
            expect(imageSource).toContain("loading={submitting}");
            expect(imageSource).toContain("disabled={!canGenerate || submitting || isUploading || hasUploadError}");
            expect(imageSource).toContain("正在提交任务...");
            // 3. 严格排除历史遗留手动中止与取消退款文案
            expect(imageSource).not.toContain("手动中止");
            expect(imageSource).not.toContain("取消退款");
        });

        it("生视频工作台：禁止出现【中止生成】或手动中止退还积分按钮，发起后快速释放前端锁定支持并发发起", () => {
            // 1. 严格禁止用户前端【中止生成】、【中止任务】选择与手动中止函数
            expect(videoSource).not.toContain("中止生成");
            expect(videoSource).not.toContain("handleCancelGeneration");

            // 2. 发起后主生成按钮在瞬时提交期锁定，并在提交后快速释放支持再次发起
            expect(videoSource).toContain("loading={submitting}");
            expect(videoSource).toContain("disabled={!canGenerate || submitting || isUploading || hasUploadError}");
            expect(videoSource).toContain("正在提交任务...");

            // 3. 严格排除历史遗留手动中止与取消退款文案，全面契约化为中断退款与中断状态
            expect(videoSource).not.toContain("手动中止");
            expect(videoSource).not.toContain("取消退款");
        });
    });

    describe("规范二：工作流卡片内置提示词前端脱敏与回填规范 (Workflow Card Prompt Privacy & Backfill Governance)", () => {
        it("生图工作台：切换工作流卡片不得将内置指令灌入输入框，仅经过扣费的助手优化后提示词体现到输入框", () => {
            // 1. 切换工作流卡片时清空输入框，内置 instructions 绝不在前端输入框展示
            expect(imageSource).toContain('// 切换卡片：按规范清除原输入框文字');
            expect(imageSource).toContain('setPrompt("");');

            // 2. 只有经过扣费的助手优化提示词后（handleOptimizePrompt），才将 optimizedPrompt 回填到输入框
            expect(imageSource).toContain("setPrompt(res.optimizedPrompt);");

            // 3. 后台组装（assembleWorkbenchPrompt）在静默底盘下生效，不污染前端输入框
            expect(imageSource).toContain("const assembled = assembleWorkbenchPrompt({");

            // 4. 客户端本地兜底生成必须派发包含工作流指令的 requestText，杜绝指令缺失
            expect(imageSource).toContain("const promptToSend = snapshot.requestText || snapshot.text;");
        });

        it("生视频工作台：除【深度复刻】与助手优化后脚本回填外，其他工作流内置提示词不在前端输入框展示", () => {
            // 1. 切换视频卡片时清空输入框，内置方向指引绝不在前端输入框展示
            expect(videoSource).toContain('// 切换视频卡片：清除原输入框文字，保留已上传的素材文件');
            expect(videoSource).toContain('updateDraft({ prompt: "", textReferences: [] });');

            // 2. 深度复刻（reference-replication）：用户推演/确认后，允许将复刻提示词回填到输入框
            expect(videoSource).toContain('activeSkillId === "reference-replication"');
            expect(videoSource).toContain("prompt: finalPrompt");

            // 3. 编导助手（DirectorAssistantPanel）：生成分镜脚本后，用户点击应用脚本允许回填到输入框
            expect(videoSource).toContain("onApplyScript={(script, meta) => {");
            expect(videoSource).toContain("setPrompt(script);");
        });

        it("工作流卡片展示组件：技能选择浮层与展示面板严禁直接暴露内置提示词文本", () => {
            const pickerPath = path.resolve(import.meta.dir, "../src/extensions/image-workbench-skills/components/skill-picker-popover.tsx");
            const showcasePath = path.resolve(import.meta.dir, "../src/extensions/image-workbench-skills/components/skill-showcase-panel.tsx");
            const videoPickerPath = path.resolve(import.meta.dir, "../src/extensions/video-workbench-skills/components/video-skill-picker-popover.tsx");

            const pickerSource = fs.readFileSync(pickerPath, "utf-8");
            const showcaseSource = fs.readFileSync(showcasePath, "utf-8");
            const videoPickerSource = fs.readFileSync(videoPickerPath, "utf-8");

            // 严禁在卡片选择器或展示面板中暴露 raw instructions 或 directions
            expect(pickerSource).not.toContain("skill.instructions");
            expect(showcaseSource).not.toContain("skill.instructions");
            expect(videoPickerSource).not.toContain("VIDEO_SKILL_DIRECTIONS");
            expect(videoPickerSource).not.toContain("resolveVideoSkillDirectionText");
        });
    });

    describe("规范三：超时排队提示与成片扣费回填安全契约 (Queuing Notice & Media Billing Backfill Governance)", () => {
        it("生图工作台与生视频工作台：均采用 Map 级并发账单记录，杜绝多任务并发覆盖", () => {
            expect(imageSource).toContain("activeChargedCreditsMapRef = useRef<Map<string, ImageChargedCreditRecord>>(new Map())");
            expect(videoSource).toContain("activeChargedCreditsMapRef = useRef<Map<string, VideoChargedCreditRecord>>(new Map())");
            expect(imageSource).not.toContain("activeChargedCreditsRef");
            expect(videoSource).not.toContain("activeChargedCreditsRef");
        });

        it("生图工作台与生视频工作台：均在算力高峰等待时展示友好的长效托管排队提示", () => {
            expect(imageSource).toContain("当前生图算力高峰排队中，已转入后台长效托管，生成完成后将自动入库回填");
            expect(videoSource).toContain("当前模型算力高峰排队中，已转入后台长效托管，成片后将自动入库回填，请耐心等待");
        });

        it("生图工作台与生视频工作台：成片产出必须保留扣费，仅在上游全部失败报错时原路退款", () => {
            // 生图：产生有效图片落定扣费
            expect(imageSource).toContain("产出有效图片即扣积分，不设补偿免单");
            // 生视频：产生有效视频落定扣费
            expect(videoSource).toContain("产出有效视频即扣积分，不设补偿免单");
            // 成功落库必须保留 chargedMicrocredits 记录
            expect(imageSource).toContain("chargedMicrocredits: log.chargedMicrocredits || effectiveChargedCredits");
            expect(videoSource).toContain("chargedMicrocredits: log.chargedMicrocredits || effectiveChargedCredits");
        });
    });
});
