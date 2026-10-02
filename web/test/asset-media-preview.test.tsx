import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AssetMediaPreview } from "@/components/asset-media-preview";
import type { Asset } from "@/stores/use-asset-store";

test("视频素材在首屏渲染时严格杜绝 <video> 标签，满足 0KB 视频网络流量铁律", () => {
    const videoAssetWithCover: Asset = {
        id: "asset-video-1",
        title: "Test Video with Cover",
        kind: "video",
        coverUrl: "https://example.com/cover.webp",
        data: {
            url: "https://example.com/stream.mp4",
            durationMs: 12000,
        },
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-01T00:00:00Z",
    };

    const markup = renderToStaticMarkup(
        <AssetMediaPreview asset={videoAssetWithCover} alt="测试视频" className="test-cover" />
    );

    // 必须包含海报图片
    expect(markup).toContain("https://example.com/cover.webp");
    // 绝对严禁挂载 <video> 标签（避免首屏 Range 分段请求并发阻塞 HTTP 连接池）
    expect(markup).not.toContain("<video");
});

test("无封面的视频素材在首屏使用 fallback 或美学占位，杜绝首屏挂载 <video>", () => {
    const videoAssetWithoutCover: Asset = {
        id: "asset-video-2",
        title: "Test Video without Cover",
        kind: "video",
        data: {
            url: "https://example.com/raw-stream.mp4",
            durationMs: 5000,
        },
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-01T00:00:00Z",
    };

    const markup = renderToStaticMarkup(
        <AssetMediaPreview
            asset={videoAssetWithoutCover}
            alt="裸视频"
            className="test-cover"
            fallback={<div className="custom-fallback">无预览</div>}
        />
    );

    // 渲染 fallback
    expect(markup).toContain("custom-fallback");
    expect(markup).toContain("无预览");
    // 依然绝对严禁首屏挂载 <video>
    expect(markup).not.toContain("<video");
});

test("图片素材正常通过 CachedResourceImage 渲染", () => {
    const imageAsset: Asset = {
        id: "asset-image-1",
        title: "Test Image",
        kind: "image",
        data: {
            dataUrl: "https://example.com/pic.webp",
            storageKey: "res-key-123",
        },
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-01T00:00:00Z",
    };

    const markup = renderToStaticMarkup(
        <AssetMediaPreview asset={imageAsset} alt="测试图片" className="test-image-cover" />
    );

    expect(markup).toContain("https://example.com/pic.webp");
    expect(markup).not.toContain("<video");
});
