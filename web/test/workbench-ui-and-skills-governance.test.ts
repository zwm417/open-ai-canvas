import { expect, test } from "bun:test";

test("技能广场分类样式与布局契约 (Skills Library Layout & Sidebar Governance)", async () => {
    const css = await Bun.file(new URL("../src/styles/workspace-product.css", import.meta.url)).text();

    expect(css).toContain(".skills-library-layout");
    expect(css).toContain(".skills-library-sidebar");
    expect(css).toContain(".skills-category-section");
    expect(css).toContain(".skills-library-sidebar-heading");
    expect(css).toContain(".skills-library-category-list");
    expect(css).toContain(".skills-library-category-item");
    expect(css).toContain(".skills-library-category-row");
    expect(css).toContain(".skills-library-category-delete");
    expect(css).toContain(".skills-library-category-error");
    expect(css).toContain(".skills-library-results");
    expect(css).toContain("var(--control-selected-bg");
    expect(css).toContain("var(--control-selected-fg");
});

test("生图工作台结果卡片与网格自适应契约 (Image Workbench Result Card & Grid Governance)", async () => {
    const source = await Bun.file(new URL("../src/pages/image/index.tsx", import.meta.url)).text();

    // 1. ResultImageCard 必须包含 3 个图标操作按钮并配备 Tooltip 悬停说明，且不包含挤压折行的大汉字按钮
    expect(source).toContain('aria-label={t("common.addToAssets")}');
    expect(source).toContain('aria-label={t("imageWorkbench.addReference")}');
    expect(source).toContain('aria-label={t("common.download")}');
    expect(source).toContain('<Tooltip title={t("common.addToAssets")} placement="top">');
    expect(source).toContain('<Tooltip title={t("imageWorkbench.addReference")} placement="top">');
    expect(source).toContain('<Tooltip title={t("common.download")} placement="top">');

    // 2. 清理死常量 RESULT_ACTION_BUTTON_CLASS
    expect(source).not.toContain("RESULT_ACTION_BUTTON_CLASS");

    // 3. 结果网格必须为流式 auto-fill 自适应容器
    expect(source).toContain("grid-cols-[repeat(auto-fill,minmax(210px,1fr))]");
    expect(source).not.toContain("sm:grid-cols-2 2xl:grid-cols-3");

    // 4. 主网格不再硬编码写死 720px / 760px，必须为弹性 minmax
    expect(source).toContain("lg:grid-cols-[minmax(400px,580px)_minmax(300px,1fr)]");
    expect(source).toContain("xl:grid-cols-[minmax(440px,640px)_minmax(340px,1fr)]");
    expect(source).not.toContain("xl:grid-cols-[720px_minmax(0,1fr)]");

    // 5. 必须具备 min-w-0 防止 CSS Grid 项发生宽度撑破
    expect(source).toContain("relative thin-scrollbar flex min-w-0 flex-col rounded-2xl");
    expect(source).toContain("thin-scrollbar min-w-0 rounded-2xl border");
});

test("生视频工作台结果卡片与画布解耦契约 (Video Workbench Result Card & Canvas Decoupling)", async () => {
    const source = await Bun.file(new URL("../src/pages/video/index.tsx", import.meta.url)).text();

    // 1. 彻底删除载入画布按钮及相关调用
    expect(source).not.toContain("载入画布");
    expect(source).not.toContain("onSendToCanvas");
    expect(source).not.toContain("sendVideoToCanvas");

    // 2. 彻底解耦画布模块，清理死依赖
    expect(source).not.toContain("useCanvasStore");
    expect(source).not.toContain("CanvasNodeType");

    // 3. 结果网格为流式 auto-fill 自适应容器
    expect(source).toContain("grid-cols-[repeat(auto-fill,minmax(280px,1fr))]");

    // 4. 主网格为弹性 minmax
    expect(source).toContain("lg:grid-cols-[minmax(400px,580px)_minmax(300px,1fr)]");
    expect(source).toContain("xl:grid-cols-[minmax(440px,640px)_minmax(340px,1fr)]");
    expect(source).not.toContain("xl:grid-cols-[720px_minmax(0,1fr)]");

    // 5. 必须具备 min-w-0 防止 CSS Grid 项发生宽度撑破
    expect(source).toContain("thin-scrollbar flex min-w-0 flex-col rounded-2xl");
    expect(source).toContain("thin-scrollbar min-w-0 rounded-2xl border");
});

test("生成记录卡片精简与无杂乱微型元数据契约 (Workbench LogCard Streamlined Meta Governance)", async () => {
    const [imageSource, videoSource] = await Promise.all([
        Bun.file(new URL("../src/pages/image/index.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/video/index.tsx", import.meta.url)).text(),
    ]);

    // 生图 LogCard：单行连接元数据与微胶囊状态
    expect(imageSource).toContain('[log.size, log.quality, log.imageCount ? `${log.imageCount}张` : null].filter(Boolean).join(" · ")');

    // 生视频 LogCard：单行连接元数据与微胶囊状态
    expect(videoSource).toContain('outputCount ? `${outputCount}个结果` : null');
});

test("电商套图工作流卡片正向架构与无层级重叠契约 (Detail Set Workflow Card & Phone Preview Governance)", async () => {
    const cardSource = await Bun.file(
        new URL("../src/extensions/image-workbench-skills/components/detail-set-workflow-card.tsx", import.meta.url)
    ).text();
    const indexSource = await Bun.file(
        new URL("../src/pages/image/index.tsx", import.meta.url)
    ).text();

    // 1. ModuleCard 彻底修复非法的 button > input 嵌套，采用语义化 div
    expect(cardSource).toContain('role="checkbox"');
    expect(cardSource).not.toContain('<button\n            type="button"\n            aria-pressed={enabled}');

    // 2. 移除卡片内部重复的底部全宽“AI 规划套图”与“确认生成”渐变按钮（由 index.tsx 底栏统一下发）
    expect(cardSource).not.toContain('AI 规划套图（{totalCount} 张）');
    expect(cardSource).not.toContain('确认生成（{plan.rows.length} 张）');

    // 3. 手机预览面板 PhonePreviewPanel 剔除水平打架挤压的模块编辑面板，保持纯净单列居中
    expect(cardSource).not.toContain("模块编辑面板");
    expect(cardSource).toContain("w-full max-w-[360px]");
    expect(cardSource).toContain("智影 · 电商套图手机预览");

    // 4. PlanReviewView 提供商品名与价格的就地编辑输入
    expect(cardSource).toContain("updatePlanMeta(plan.planId, { productName: e.target.value })");
    expect(cardSource).toContain("updatePlanMeta(plan.planId, { price: e.target.value })");

    // @opc-feature: detail_set_workflow [start]
    // 5. 图片语言按用户拍板回归底部三段式（模型 | 图片语言 | 参数），套图卡内不再重复承载
    expect(indexSource).toContain("图片语言");
    expect(indexSource).toContain('aria-label="图片语言"');
    expect(indexSource).toContain('<span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">参数</span>');
    expect(cardSource).not.toContain("图片语言");
    // @opc-feature: detail_set_workflow [end]
});

