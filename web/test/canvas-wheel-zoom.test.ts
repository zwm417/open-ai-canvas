import { describe, expect, test } from "bun:test";

describe("canvas wheel zoom and node scroll isolation", () => {
    test("infinite-canvas contains opc-feature fence for canvas-wheel-zoom and node isolation", async () => {
        const source = await Bun.file(new URL("../src/components/canvas/infinite-canvas.tsx", import.meta.url)).text();
        expect(source).toContain("// @opc-feature: canvas-wheel-zoom [start]");
        expect(source).toContain("// @opc-feature: canvas-wheel-zoom [end]");
        expect(source).toContain('target?.closest("[data-node-id]")');
        expect(source).toContain("CANVAS_WHEEL_IGNORE_SELECTOR");
        expect(source).toContain("isOverNode || isOverIgnored");
        expect(source).toContain("clampScale(current.k * factor)");
    });
});
