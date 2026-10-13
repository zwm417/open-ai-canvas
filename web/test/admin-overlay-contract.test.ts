import { expect, test } from "bun:test";
import { resolve } from "node:path";

const read = async (relativePath: string) => Bun.file(new URL(`../src/${relativePath}`, import.meta.url)).text();

test("admin overlay policy keeps popups inside the admin theme boundary", async () => {
    const [container, shell, css] = await Promise.all([
        read("extensions/admin-overlay/admin-popup-container.ts"),
        read("pages/admin/components/admin-shell.tsx"),
        read("extensions/admin-overlay/admin-overlay.css"),
    ]);

    expect(container).toContain('document.querySelector<HTMLElement>("[data-admin-overlay-host]")');
    expect(container).toContain('document.getElementById("admin-root")');
    expect(container).toContain('node?.closest<HTMLElement>("[data-admin-root]")');
    expect(container).toContain("document.body");
    expect(shell).toContain('data-admin-overlay-host');
    expect(shell).toContain("getAdminPopupContainer");
    expect(css).toContain("body.admin-overlays");
    expect(css).toContain(".ant-select-dropdown");
    expect(css).toContain(".ant-select-item-option-content");
});

test("admin pages do not bypass the shared popup container", async () => {
    const glob = new Bun.Glob("src/pages/admin/**/*.{tsx,ts}");
    const files: string[] = [];
    const webRoot = resolve(import.meta.dir, "..");
    for await (const file of glob.scan({ cwd: webRoot })) files.push(file);
    const violations: string[] = [];
    for (const file of files) {
        const source = await Bun.file(resolve(webRoot, file)).text();
        if (/getPopupContainer\s*=\s*\{[\s\S]{0,240}?document\.body/.test(source)) violations.push(file);
    }
    expect(violations).toEqual([]);
});

test("upstream sync preserves the local overlay extension namespace", async () => {
    const syncScript = await Bun.file(new URL("../../scripts/sync-upstream.ps1", import.meta.url)).text();
    expect(syncScript).toContain('"web\\src\\extensions"');
});
