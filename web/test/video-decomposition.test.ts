import { describe, expect, test } from "bun:test";
import {
    normalizeVideoSamplingPolicy,
    sampleTimestampsAtFps,
    sampleMiddleTimestampsAtFps,
    DEFAULT_VIDEO_SAMPLING_POLICY,
} from "../src/extensions/opc-infinite/media/video-decomposition/frame-sampler";
import {
    resolveContactSheetColumns,
    resolveContactSheetPageSizes,
} from "../src/extensions/opc-infinite/media/video-decomposition/contact-sheet-builder";
import {
    chunkFrameManifest,
    dedupeReverseModelCandidates,
    limitGridPages,
    resolveGridFrameCount,
    resolveReverseFramesPerGrid,
} from "../src/extensions/opc-infinite/services/video-reverse-contracts";

describe("video decomposition and sampling algorithms", () => {
    test("normalizes default sampling policy accurately", () => {
        const policy = normalizeVideoSamplingPolicy();
        expect(policy.mode).toBe("seconds_and_scene");
        expect(policy.fps).toBe(1);
        expect(policy.includeMiddleFrames).toBe(true);
        expect(policy.maxFrames).toBe(500);
        expect(policy.maxFramesPerSheet).toBe(12);
    });

    test("samples timestamps at exact FPS frequency", () => {
        const timestamps = sampleTimestampsAtFps(5, 1);
        expect(timestamps).toEqual([0, 1, 2, 3, 4, 5]);

        const timestamps2Fps = sampleTimestampsAtFps(2, 2);
        expect(timestamps2Fps).toEqual([0, 0.5, 1, 1.5, 2]);
    });

    test("samples middle timestamps between intervals", () => {
        const middleTimestamps = sampleMiddleTimestampsAtFps(3, 1);
        expect(middleTimestamps).toEqual([0.5, 1.5, 2.5]);
    });

    test("calculates optimal contact sheet columns for 16:9 layout", () => {
        const columns9 = resolveContactSheetColumns(9, 300, 440);
        expect(columns9).toBe(5); // 5 cols x 2 rows gives ~1.704 (closest to 16:9)

        const columnsExplicit = resolveContactSheetColumns(9, 300, 440, 3);
        expect(columnsExplicit).toBe(3);
    });

    test("splits total frames into pages evenly", () => {
        const pageSizes = resolveContactSheetPageSizes(25, 1, 12);
        expect(pageSizes).toEqual([12, 12, 1]);

        const pageSizesLimited = resolveContactSheetPageSizes(24, 2, 12);
        expect(pageSizesLimited).toEqual([12, 12]);
    });
});

describe("video reverse contracts and helpers", () => {
    test("resolves grid frame counts correctly", () => {
        expect(resolveGridFrameCount("auto", 10)).toBe(9);
        expect(resolveGridFrameCount("auto", 25)).toBe(9);
        expect(resolveGridFrameCount(16, 25)).toBe(16);
    });

    test("chunks frame manifest into paginated arrays", () => {
        const frames = Array.from({ length: 25 }, (_, i) => ({
            frameId: `F${i + 1}`,
            timestampSec: i,
        }));
        const pages = chunkFrameManifest(frames, 12);
        expect(pages.length).toBe(3);
        expect(pages[0].length).toBe(12);
        expect(pages[1].length).toBe(12);
        expect(pages[2].length).toBe(1);
    });

    test("limits grid pages to max model images", () => {
        const pages = [1, 2, 3, 4, 5];
        const limited = limitGridPages(pages, 3);
        expect(limited.length).toBe(3);
        expect(limited).toEqual([1, 2, 3]);
    });

    test("dedupes candidate models correctly", () => {
        const candidates = [
            { config: { model: "qwen-vl-max" }, contentMode: "visual" as const },
            { config: { model: "qwen-vl-max" }, contentMode: "visual" as const },
            { config: { model: "gpt-4o" }, contentMode: "visual" as const },
        ];
        const deduped = dedupeReverseModelCandidates(candidates);
        expect(deduped.length).toBe(2);
        expect(deduped.map((c) => c.config.model)).toEqual(["qwen-vl-max", "gpt-4o"]);
    });
});
