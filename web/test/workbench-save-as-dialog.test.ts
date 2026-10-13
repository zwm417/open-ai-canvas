import { describe, expect, test, afterEach } from "bun:test";
import { downloadMediaWithSaveDialog } from "@/extensions/workbench-save-dialog/save-as-dialog";

describe("workbench save as dialog", () => {
    const originalWindow = globalThis.window;

    afterEach(() => {
        globalThis.window = originalWindow;
    });

    test("routes to desktopBridge.saveMediaAs in desktop shell environment", async () => {
        let capturedPayload: any = null;
        (globalThis as any).window = {
            desktopBridge: {
                isDesktop: true,
                saveMediaAs: async (payload: any) => {
                    capturedPayload = payload;
                    return { success: true, filePath: "D:\\output\\image-1.png", fileName: "image-1.png" };
                },
            },
        };

        const res = await downloadMediaWithSaveDialog({
            fileName: "image-1.png",
            dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            mediaType: "image",
        });

        expect(res.success).toBe(true);
        expect(res.filePath).toBe("D:\\output\\image-1.png");
        expect(capturedPayload?.defaultName).toBe("image-1.png");
        expect(capturedPayload?.mediaType).toBe("image");
    });

    test("handles user cancellation in desktop shell gracefully", async () => {
        (globalThis as any).window = {
            desktopBridge: {
                isDesktop: true,
                saveMediaAs: async () => ({ success: false, canceled: true }),
            },
        };

        const res = await downloadMediaWithSaveDialog({
            fileName: "video-1.mp4",
            url: "https://example.com/test.mp4",
            mediaType: "video",
        });

        expect(res.success).toBe(false);
        expect(res.canceled).toBe(true);
    });

    test("routes to showSaveFilePicker in browser environment", async () => {
        let pickerInvoked = false;
        let writtenBlob: Blob | null = null;
        let closed = false;

        const mockBlob = new Blob(["test-media-bytes"], { type: "image/png" });

        (globalThis as any).window = {
            showSaveFilePicker: async (options: any) => {
                pickerInvoked = true;
                expect(options.suggestedName).toBe("image-test.png");
                return {
                    createWritable: async () => ({
                        write: async (b: Blob) => { writtenBlob = b; },
                        close: async () => { closed = true; },
                    }),
                };
            },
        };

        const res = await downloadMediaWithSaveDialog({
            fileName: "image-test.png",
            blob: mockBlob,
            mediaType: "image",
        });

        expect(res.success).toBe(true);
        expect(pickerInvoked).toBe(true);
        expect(writtenBlob).toBe(mockBlob);
        expect(closed).toBe(true);
    });

    test("handles user cancellation in browser showSaveFilePicker gracefully", async () => {
        const mockBlob = new Blob(["test"], { type: "video/mp4" });

        (globalThis as any).window = {
            showSaveFilePicker: async () => {
                const err = new Error("The user aborted a request.");
                err.name = "AbortError";
                throw err;
            },
        };

        const res = await downloadMediaWithSaveDialog({
            fileName: "video-test.mp4",
            blob: mockBlob,
            mediaType: "video",
        });

        expect(res.success).toBe(false);
        expect(res.canceled).toBe(true);
    });

    test("recovers storageKey correctly when url is absent", async () => {
        let savedPayload: any = null;
        (globalThis as any).window = {
            desktopBridge: {
                isDesktop: true,
                saveMediaAs: async (payload: any) => {
                    savedPayload = payload;
                    return { success: true, filePath: "D:\\video.mp4" };
                },
            },
        };

        const res = await downloadMediaWithSaveDialog({
            fileName: "video.mp4",
            storageKey: "res_dummy_key",
            mediaType: "video",
        });

        expect(res.success).toBe(true);
        expect(savedPayload).not.toBeNull();
        expect(savedPayload.url).toBeDefined();
    });
});
