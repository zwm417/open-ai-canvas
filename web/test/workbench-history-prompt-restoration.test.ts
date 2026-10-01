import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

describe("工作台生成记录回溯与最终提示词状态契约 (Workbench History Prompt Restoration Contract)", () => {
    it("生图工作台：点击生成记录卡片必须切回最终提示词输入状态，退出工作流卡片模式", () => {
        const imageWorkbenchFile = path.resolve(import.meta.dir, "../src/pages/image/index.tsx");
        const source = fs.readFileSync(imageWorkbenchFile, "utf-8");

        // 验证 previewGenerationLog 函数实现
        const previewLogMatch = source.match(/const previewGenerationLog = async \(log: GenerationLog\) => \{([\s\S]*?)\};/);
        expect(previewLogMatch).toBeTruthy();
        const previewLogBody = previewLogMatch![1];

        // 必须调用 selectSkill(null) 退出技能/工作流卡片模式
        expect(previewLogBody.includes("selectSkill(null)")).toBe(true);
        // 必须清空技能专属槽位
        expect(previewLogBody.includes("clearAllSlots()")).toBe(true);
        // 必须同步 previousSkillIdRef.current 避免副作用清空恢复的提示词
        expect(previewLogBody.includes("previousSkillIdRef.current = null")).toBe(true);
        // 必须正确回填最终提示词
        expect(previewLogBody.includes("setPrompt(log.prompt)")).toBe(true);
        // 必须恢复参考图与关键生成配置（含透明背景等高级参数）
        expect(previewLogBody.includes("setReferences(log.references || [])")).toBe(true);
        expect(previewLogBody.includes("transparentBackground")).toBe(true);
    });

    it("生视频工作台：点击生成记录卡片必须切回最终提示词输入状态，退出工作流卡片模式与编导助手模式", () => {
        const videoWorkbenchFile = path.resolve(import.meta.dir, "../src/pages/video/index.tsx");
        const source = fs.readFileSync(videoWorkbenchFile, "utf-8");

        // 验证 previewGenerationLog 函数实现
        const previewLogMatch = source.match(/const previewGenerationLog = async \(log: GenerationLog\) => \{([\s\S]*?)\};/);
        expect(previewLogMatch).toBeTruthy();
        const previewLogBody = previewLogMatch![1];

        // 必须调用 selectSkill(null) 退出技能卡片模式
        expect(previewLogBody.includes("selectSkill(null)")).toBe(true);
        // 必须调用 exitDirectorMode() 退出编导助手模式
        expect(previewLogBody.includes("exitDirectorMode()")).toBe(true);
        // 必须同步 prevVideoSkillIdRef.current 避免技能切换副作用清空恢复的提示词
        expect(previewLogBody.includes("prevVideoSkillIdRef.current = null")).toBe(true);
        // 必须恢复生成记录的 prompt
        expect(previewLogBody.includes("prompt: log.prompt")).toBe(true);
        // 必须恢复素材
        expect(previewLogBody.includes("references: log.references || []")).toBe(true);
        expect(previewLogBody.includes("videoReferences: log.videoReferences || []")).toBe(true);
        expect(previewLogBody.includes("audioReferences: log.audioReferences || []")).toBe(true);
    });

    it("模型选择器：性能防护规范，PopOver表面严禁挂载冲突Transform动画，价目与渲染必须具备企业级缓存", () => {
        const modelPickerFile = path.resolve(import.meta.dir, "../src/components/model-picker.tsx");
        const source = fs.readFileSync(modelPickerFile, "utf-8");

        // 必须具备价目 WeakMap 缓存，杜绝下拉打开时重复解析成百上千档位字符串
        expect(source.includes("const priceSummaryCache = new WeakMap")).toBe(true);
        expect(source.includes("priceSummaryCache.get(cost)")).toBe(true);

        // AriaPopover 上严禁包含与 React Aria 内联 translate3d 定位冲突的 zoom-in-95 缩放动画
        const popoverMatch = source.match(/<AriaPopover[\s\S]*?<\/AriaPopover>/);
        expect(popoverMatch).toBeTruthy();
        const popoverMarkup = popoverMatch![0];
        expect(popoverMarkup.includes("zoom-in-95")).toBe(false);

        // 下拉内容抽离为独立的 ModelPickerMenuContent，闭合时不执行无意义的大量 DOM 构建
        expect(source.includes("ModelPickerMenuContent")).toBe(true);
        expect(source.includes("{open ? (")).toBe(true);
        // 验证 activeGroupKey 必须直接透传，不能使用 ?? 覆盖 null，从而保证 ArrowLeft 键能正常回退到品牌列表
        expect(source.includes("activeGroupKey={activeGroupKey}")).toBe(true);

        // 验证 CSS 中已解除 creation-popover-enter 冲突动画
        const cssFile = path.resolve(import.meta.dir, "../src/styles/shared/model-picker.css");
        const cssSource = fs.readFileSync(cssFile, "utf-8");
        expect(cssSource.includes(".creation-model-picker-surface")).toBe(true);
        expect(cssSource).toMatch(/\.creation-model-picker-surface[\s\S]*?animation:\s*none\s*!important/);
    });
});
