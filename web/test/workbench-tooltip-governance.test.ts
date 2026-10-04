import { describe, expect, it } from "bun:test";
import fs from "fs";
import path from "path";

// @opc-feature: workbench-tooltip-governance-test [start]
describe("工作台商业级 Tooltip 规范与悬停防重叠防遮挡治理测试 (Workbench Tooltip Commercial Governance)", () => {
    const webRoot = path.resolve(__dirname, "..");
    const globalsCssPath = path.join(webRoot, "src/styles/globals.css");
    const imagePagePath = path.join(webRoot, "src/pages/image/index.tsx");
    const videoPagePath = path.join(webRoot, "src/pages/video/index.tsx");
    const skillUploadSlotsPath = path.join(
        webRoot,
        "src/extensions/image-workbench-skills/components/skill-upload-slots.tsx",
    );
    const referenceReplicationPanelPath = path.join(
        webRoot,
        "src/extensions/video-workbench-skills/components/reference-replication-panel.tsx",
    );
    const directorAssistantPanelPath = path.join(
        webRoot,
        "src/extensions/video-workbench-skills/components/director-assistant-panel.tsx",
    );

    it("规范一：globals.css 必须全局声明商业级高对比度 Tooltip 体系（高 z-index、深底高对比、立体边框与投影）", () => {
        const cssContent = fs.readFileSync(globalsCssPath, "utf-8");

        // 1. z-index 治理：确保 Tooltip 具备最高层级 10000，杜绝被工作台侧边栏、大图预览、抽屉遮挡
        expect(cssContent).toContain("z-index: 10000 !important;");

        // 2. 亮暗主题统一高对比胶囊底色：避免纯白底色在浅色背景上无边界融叠
        expect(cssContent).toContain("background: #18181b !important;");
        expect(cssContent).toContain("color: #fafafa !important;");
        expect(cssContent).toContain("border: 1px solid rgba(255, 255, 255, 0.16) !important;");

        // 3. 深色模式与 [data-theme='dark'] 高对比深灰
        expect(cssContent).toContain("background: #27272a !important;");
        expect(cssContent).toContain("color: #f4f4f5 !important;");
        expect(cssContent).toContain("border: 1px solid rgba(255, 255, 255, 0.18) !important;");

        // 4. 箭头与背景、边框无缝咬合
        expect(cssContent).toContain(".ant-tooltip .ant-tooltip-arrow::before");
        expect(cssContent).toContain("pointer-events: none !important;");
    });

    it("规范二：生图工作台【剪切板】、【提示词模版】、【保存为模版】、【查看我的资产】、【清空/删除素材】必须标准悬停提示且无浏览器原生 title 冲突", () => {
        const imageContent = fs.readFileSync(imagePagePath, "utf-8");

        // 工具栏五大图标 Tooltip
        expect(imageContent).toContain('<Tooltip title="从剪切板粘贴" placement="top" mouseEnterDelay={0.15}>');
        expect(imageContent).toContain('<Tooltip title="提示词模板" placement="top" mouseEnterDelay={0.15}>');
        expect(imageContent).toContain('<Tooltip title="保存为模板" placement="top" mouseEnterDelay={0.15}>');
        expect(imageContent).toContain('<Tooltip title="查看我的资产" placement="top" mouseEnterDelay={0.15}>');
        expect(imageContent).toContain('<Tooltip title="清空素材" placement="top" mouseEnterDelay={0.15}>');

        // 单卡悬浮操作：必须包含 placement="top" 且杜绝 button 上的 native title 属性导致原生浮层冲突
        expect(imageContent).toContain("<Tooltip title={replaceLabel} placement=\"top\" mouseEnterDelay={0.15}>");
        expect(imageContent).toContain("<Tooltip title={removeLabel} placement=\"top\" mouseEnterDelay={0.15}>");
        expect(imageContent).not.toMatch(/<button[^>]*title=\{removeLabel\}/);
        expect(imageContent).not.toMatch(/<button[^>]*title=\{replaceLabel\}/);
    });

    it("规范三：生视频工作台【剪切板】、【提示词模版】、【保存为模版】、【查看我的资产】、【清空/删除素材】必须标准悬停提示且无浏览器原生 title 冲突", () => {
        const videoContent = fs.readFileSync(videoPagePath, "utf-8");

        // 工具栏五大图标 Tooltip
        expect(videoContent).toContain('<Tooltip title="从剪切板粘贴" placement="top" mouseEnterDelay={0.15}>');
        expect(videoContent).toContain('<Tooltip title="提示词模板" placement="top" mouseEnterDelay={0.15}>');
        expect(videoContent).toContain('<Tooltip title="保存为模板" placement="top" mouseEnterDelay={0.15}>');
        expect(videoContent).toContain('<Tooltip title="查看我的资产" placement="top" mouseEnterDelay={0.15}>');
        expect(videoContent).toContain('<Tooltip title="清空素材" placement="top" mouseEnterDelay={0.15}>');

        // 单卡悬浮操作：必须包含 placement="top" 且杜绝 button 上的 native title 属性
        expect(videoContent).toContain("<Tooltip title={replaceLabel} placement=\"top\" mouseEnterDelay={0.15}>");
        expect(videoContent).toContain("<Tooltip title={removeLabel} placement=\"top\" mouseEnterDelay={0.15}>");
        expect(videoContent).not.toMatch(/<button[^>]*title=\{removeLabel\}/);
        expect(videoContent).not.toMatch(/<button[^>]*title=\{replaceLabel\}/);
    });

    it("规范四：技能槽组件（skill-upload-slots）所有操作入口必须 100% 覆盖 Tooltip 且移除 native title", () => {
        const slotsContent = fs.readFileSync(skillUploadSlotsPath, "utf-8");

        // 工具栏
        expect(slotsContent).toContain('<Tooltip title="从剪切板粘贴" placement="top" mouseEnterDelay={0.15}>');
        expect(slotsContent).toContain('<Tooltip title="提示词模板" placement="top" mouseEnterDelay={0.15}>');
        expect(slotsContent).toContain('<Tooltip title="保存为模板" placement="top" mouseEnterDelay={0.15}>');
        expect(slotsContent).toContain('<Tooltip title="查看我的资产" placement="top" mouseEnterDelay={0.15}>');
        expect(slotsContent).toContain('<Tooltip title="清空素材" placement="top" mouseEnterDelay={0.15}>');

        // 折叠卡操作与追加入口
        expect(slotsContent).toContain('<Tooltip title="查看大图" placement="top" mouseEnterDelay={0.15}>');
        expect(slotsContent).toContain('<Tooltip title="替换此图" placement="top" mouseEnterDelay={0.15}>');
        expect(slotsContent).toContain('<Tooltip title="删除素材" placement="top" mouseEnterDelay={0.15}>');
        expect(slotsContent).toContain('<Tooltip title="追加素材" placement="top" mouseEnterDelay={0.15}>');

        // 单卡槽操作入口
        expect(slotsContent).toContain('<Tooltip title="替换图片" placement="top" mouseEnterDelay={0.15}>');
    });

    it("规范五：视频深度复刻面板与导演助手面板所有操作入口必须统一对齐 Tooltip 规范", () => {
        const refRepContent = fs.readFileSync(referenceReplicationPanelPath, "utf-8");
        expect(refRepContent).toContain('<Tooltip title="从剪切板粘贴" placement="top" mouseEnterDelay={0.15}>');
        expect(refRepContent).toContain('<Tooltip title="提示词模板" placement="top" mouseEnterDelay={0.15}>');
        expect(refRepContent).toContain('<Tooltip title="保存为模板" placement="top" mouseEnterDelay={0.15}>');
        expect(refRepContent).toContain('<Tooltip title="查看我的资产" placement="top" mouseEnterDelay={0.15}>');
        expect(refRepContent).toContain('<Tooltip title="清空素材" placement="top" mouseEnterDelay={0.15}>');
        expect(refRepContent).toContain('<Tooltip title="替换素材" placement="top" mouseEnterDelay={0.15}>');
        expect(refRepContent).toContain('<Tooltip title="移除素材" placement="top" mouseEnterDelay={0.15}>');

        const directorContent = fs.readFileSync(directorAssistantPanelPath, "utf-8");
        expect(directorContent).toContain('<Tooltip title="从剪切板粘贴" placement="top" mouseEnterDelay={0.15}>');
        expect(directorContent).toContain('<Tooltip title="提示词模板" placement="top" mouseEnterDelay={0.15}>');
        expect(directorContent).toContain('<Tooltip title="保存为模板" placement="top" mouseEnterDelay={0.15}>');
        expect(directorContent).toContain('<Tooltip title="查看我的资产" placement="top" mouseEnterDelay={0.15}>');
        expect(directorContent).toContain('<Tooltip title="清空素材" placement="top" mouseEnterDelay={0.15}>');
        expect(directorContent).toContain('<Tooltip title="移除图片" placement="top" mouseEnterDelay={0.15}>');
        expect(directorContent).toContain('<Tooltip title="移除音频" placement="top" mouseEnterDelay={0.15}>');
    });
});
// @opc-feature: workbench-tooltip-governance-test [end]
