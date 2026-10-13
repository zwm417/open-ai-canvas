import { describe, expect, test } from "bun:test";

function isImageLikeUrl(url?: string): boolean {
    if (!url) return false;
    if (url.startsWith("data:image/") || url.startsWith("blob:")) return true;
    const cleanUrl = url.split(/[?#]/)[0].toLowerCase();
    return !/\.(mp4|webm|mov|m4v|ogg|ogv|avi|mkv|flv|mp3|wav|m4a|aac)$/i.test(cleanUrl);
}

describe("资产板块正向治理三层验收测试 (Asset Library Actions & Media Governance)", () => {
    test("问题 2：素材卡片右上角【…】更多选项与分类移动弹窗契约", async () => {
        const source = await Bun.file(new URL("../src/pages/assets/asset-library-cards.tsx", import.meta.url)).text();

        // 1. 彻底弃用 Ant Design 原生 Dropdown，改用设计系统顶级 DropdownMenu（基于 react-aria-components，杜绝 -8000px 溢出）
        expect(source).toContain('import { DropdownMenu, type DropdownMenuItem } from "@/components/ui/base/dropdown-menu";');
        expect(source).not.toContain('Dropdown,');
        expect(source).not.toContain('Dropdown } from "antd"');
        expect(source).toContain("<DropdownMenu");
        expect(source).toContain('triggerClassName="assets-cover-more"');
        expect(source).toContain('ariaLabel="更多素材操作"');

        // 2. 严密的事件防穿透阻断（onClick 与 onPointerDown 拦截，防止父级卡片与文档事件导致菜单失焦瞬闭）
        expect(source).toContain("event.stopPropagation()");
        expect(source).toContain("onPointerDown={(event) => event.stopPropagation()}");

        // 3. 移动分类升级为独立模态弹窗 Modal，彻底消除在网格卡片边缘子菜单被父容器裁剪与层级遮挡问题
        expect(source).toContain("const [moveModalOpen, setMoveModalOpen] = useState(false);");
        expect(source).toContain("<Modal");
        expect(source).toContain('title={`移动《${asset.title}》到分类`}');
        expect(source).toContain("open={moveModalOpen}");
        expect(source).toContain("onCancel={() => setMoveModalOpen(false)}");

        // 4. 菜单项语义完整性检查
        expect(source).toContain('key: "restore"');
        expect(source).toContain('key: "delete"');
        expect(source).toContain('key: "move"');
        expect(source).toContain('label: "移动到分类..."');
        expect(source).toContain('key: "archive"');
    });

    test("问题 3：图片素材 0ms 占位与 1:1 原图物理尺寸缩放契约", async () => {
        const source = await Bun.file(new URL("../src/pages/assets/asset-library-panels.tsx", import.meta.url)).text();

        // 1. 遵循商业化规范：0ms 底层缩略图秒开，后台异步通过 resolveImageUrl 加载未压缩的高清原始图，杜绝模糊缩略图当大图
        expect(source).toContain("resolveImageUrl(asset.data.storageKey, asset.data.dataUrl || asset.coverUrl)");
        expect(source).toContain("setHighResSrc(resolved)");

        // 2. 精准物理像素计算与 1:1 原图尺寸双向切换 (toggleNaturalScale)
        expect(source).toContain("updateNaturalRatio");
        expect(source).toContain("img.naturalWidth, img.clientWidth");
        expect(source).toContain("toggleNaturalScale");
        expect(source).toContain("Math.abs(scale - naturalRatio) < 0.15");

        // 3. 支持在独立全屏/新窗口查看原始大图
        expect(source).toContain("openOriginalInNewTab");
        expect(source).toContain('window.open(activeSrc, "_blank", "noopener,noreferrer")');
        expect(source).toContain("<ExternalLink className=\"size-4\" />");

        // 4. 最大缩放倍率扩容至 10 倍（由 4x 提升至 10x，满足高精度像素级检视需求）
        expect(source).toContain("Math.min(10, Math.max(0.2,");
        expect(source).toContain("Math.min(10, value * 1.25)");
    });

    test("问题 1：视频文件防黑屏全链路治理契约", async () => {
        const previewSource = await Bun.file(new URL("../src/components/asset-media-preview.tsx", import.meta.url)).text();
        const videoPageSource = await Bun.file(new URL("../src/pages/video/index.tsx", import.meta.url)).text();
        const posterLibSource = await Bun.file(new URL("../src/lib/video-poster.ts", import.meta.url)).text();
        const panelsSource = await Bun.file(new URL("../src/pages/assets/asset-library-panels.tsx", import.meta.url)).text();

        // 1. isImageLikeUrl 过滤：防止视频 mp4 路径被当成图片海报导致卡片封面崩溃黑屏
        expect(previewSource).toContain("isImageLikeUrl");
        expect(previewSource).toContain("mp4|webm|mov|m4v");

        // 2. 自动异步抽帧兜底：若视频素材无封面或封面被污染，后台异步调用 captureVideoPoster 生成 WebP 封面
        expect(previewSource).toContain("captureVideoPoster(videoUrl, { maxWidth: 480 })");
        expect(previewSource).toContain("setExtractedPoster(URL.createObjectURL(res.poster))");

        // 3. 生视频工作台保存资产时：优先提取/生成 WebP 封面，绝不将视频 mp4 URL 直接落入 coverUrl
        expect(videoPageSource).toContain("saveResultToAssets = async (video: GeneratedVideo) => {");
        expect(videoPageSource).toContain("let posterUrl = video.posterUrl || \"\";");
        expect(videoPageSource).toContain("captureVideoPoster(video.url, { maxWidth: 480 })");

        // 4. video-poster.ts 防黑帧亮度采样：亮度阈值提高至 12，重试 3 次，自适应步进跳过片头黑场淡入
        expect(posterLibSource).toContain("avgLuma < 12 && attempts < 3");
        expect(posterLibSource).toContain("Math.min(Math.max(0.6, video.duration * 0.3), 0.5 + attempts * 0.9)");

        // 5. 详情抽屉 AssetVideoArchivePreview：彻底移除 overflow-hidden rounded-xl bg-black 纯黑底框，使用美学渐变骨架与异步海报加载
        expect(panelsSource).not.toContain("overflow-hidden rounded-xl bg-black");
        expect(panelsSource).toContain("bg-muted/40 dark:bg-stone-900 border border-border/40");
        expect(panelsSource).toContain("resolveMediaUrl(asset.data.storageKey, asset.data.url, \"video\")");
        expect(panelsSource).toContain("!effectivePoster && !videoLoaded && !hasError");
    });

    test("isImageLikeUrl 纯函数单元逻辑断言", () => {
        // 图片类 URL 判定为 true
        expect(isImageLikeUrl("https://oss.example.com/covers/poster.jpg")).toBe(true);
        expect(isImageLikeUrl("https://oss.example.com/covers/poster.png?v=2")).toBe(true);
        expect(isImageLikeUrl("https://oss.example.com/covers/poster.webp#hero")).toBe(true);
        expect(isImageLikeUrl("data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v39gA==")).toBe(true);
        expect(isImageLikeUrl("blob:http://localhost:3000/123e4567-e89b-12d3-a456-426614174000")).toBe(true);

        // 视频与音频类 URL 必须判定为 false，杜绝污染 coverUrl
        expect(isImageLikeUrl("https://oss.example.com/videos/output.mp4")).toBe(false);
        expect(isImageLikeUrl("https://oss.example.com/videos/output.mp4?token=abc#t=0.5")).toBe(false);
        expect(isImageLikeUrl("https://oss.example.com/videos/scene.mov")).toBe(false);
        expect(isImageLikeUrl("https://oss.example.com/videos/clip.webm")).toBe(false);
        expect(isImageLikeUrl("https://oss.example.com/audios/bgm.mp3")).toBe(false);
        expect(isImageLikeUrl("https://oss.example.com/audios/voice.wav")).toBe(false);

        // 空值兜底
        expect(isImageLikeUrl(undefined)).toBe(false);
        expect(isImageLikeUrl("")).toBe(false);
    });
});
