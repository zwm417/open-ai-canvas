import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
    isDesktopShell,
    saveMediaToDedicatedFolder,
    openDedicatedFolder,
    getDedicatedFolder,
} from "@/extensions/desktop-media-save";

describe("desktop-media-save extension", () => {
    const originalWindow = globalThis.window;

    afterEach(() => {
        globalThis.window = originalWindow;
    });

    test("isDesktopShell returns false when desktopBridge is absent", () => {
        (globalThis as any).window = {};
        expect(isDesktopShell()).toBe(false);
    });

    test("isDesktopShell returns true when desktopBridge.isDesktop is true", () => {
        (globalThis as any).window = {
            desktopBridge: { isDesktop: true },
        };
        expect(isDesktopShell()).toBe(true);
    });

    test("saveMediaToDedicatedFolder routes to desktopBridge.saveMedia", async () => {
        let savedPayload: any = null;
        (globalThis as any).window = {
            desktopBridge: {
                isDesktop: true,
                saveMedia: async (payload: any) => {
                    savedPayload = payload;
                    return { success: true, filePath: "C:\\Users\\test\\智影专属媒体\\images\\test.png" };
                },
            },
        };

        const res = await saveMediaToDedicatedFolder({
            fileName: "test.png",
            url: "https://example.com/test.png",
            mediaType: "image",
        });

        expect(res?.success).toBe(true);
        expect(res?.filePath).toBe("C:\\Users\\test\\智影专属媒体\\images\\test.png");
        expect(savedPayload?.fileName).toBe("test.png");
        expect(savedPayload?.mediaType).toBe("image");
    });

    test("openDedicatedFolder and getDedicatedFolder call desktopBridge APIs", async () => {
        let openedFolder = "";
        (globalThis as any).window = {
            desktopBridge: {
                isDesktop: true,
                getMediaSaveDir: async () => "C:\\Users\\test\\智影专属媒体",
                openMediaSaveDir: async (sub: string) => {
                    openedFolder = `C:\\Users\\test\\智影专属媒体\\${sub}`;
                    return openedFolder;
                },
            },
        };

        const dir = await getDedicatedFolder();
        expect(dir).toBe("C:\\Users\\test\\智影专属媒体");

        const opened = await openDedicatedFolder("videos");
        expect(opened).toBe("C:\\Users\\test\\智影专属媒体\\videos");
        expect(openedFolder).toBe("C:\\Users\\test\\智影专属媒体\\videos");
    });

    test("verifies subtle fence annotations in native files", () => {
        const browserDownloadSrc = readFileSync(resolve(import.meta.dir, "../src/services/browser-download.ts"), "utf-8");
        expect(browserDownloadSrc).toContain("// @opc-feature: desktop-media-save [start]");
        expect(browserDownloadSrc).toContain("// @opc-feature: desktop-media-save [end]");

        const generationSyncSrc = readFileSync(resolve(import.meta.dir, "../src/lib/canvas/canvas-generation-task-sync.ts"), "utf-8");
        expect(generationSyncSrc).toContain("// @opc-feature: desktop-media-save [start]");
        expect(generationSyncSrc).toContain("// @opc-feature: desktop-media-save [end]");

        const conversionNodeSrc = readFileSync(resolve(import.meta.dir, "../src/components/canvas/nodes/media-conversion-node.tsx"), "utf-8");
        expect(conversionNodeSrc).toContain("// @opc-feature: desktop-media-save [start]");
        expect(conversionNodeSrc).toContain("// @opc-feature: desktop-media-save [end]");
    });
});
