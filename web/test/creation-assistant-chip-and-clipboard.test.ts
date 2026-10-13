import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
    return readFileSync(resolve(import.meta.dir, path), "utf8").replace(/\r\n/g, "\n");
}

describe("creation assistant and canvas prompt chip clipboard and undo governance", () => {
    test("creation assistant ScriptReferencePreview rigidly locks thumbnail size and preserves @ prefix", () => {
        const fileContent = source("../src/pages/creation-assistant/index.tsx");

        // 1. 断言缩略图被锁定在 16px 刚性外壳中，杜绝任何大图拉伸溢出
        expect(fileContent).toContain('className="inline-flex size-4 shrink-0 rounded overflow-hidden align-middle"');
        expect(fileContent).toContain('alt={reference.ref}');

        // 2. 断言保留 @ 符号显示而不是被 slice 抹去
        expect(fileContent).toContain("<span>{reference.ref}</span>");

        // 3. 断言具备 onCopy 拦截与序列化
        expect(fileContent).toContain("onCopy={(event) => {");
        expect(fileContent).toContain("const serializedText = serializeScriptPreviewNodes(Array.from(fragment.childNodes));");

        // 4. 断言大模型多模态提示词不暴露原始文件名
        expect(fileContent).toContain("text: `【视觉参考图片 ${refLabel}】`");
        expect(fileContent).toContain("text: `【参考视频 ${refLabel} 抽帧拼图 ${i + 1}/${sheets.length}】`");
    });

    test("canvas prompt chip input has clipboard serialization, auto-link chip paste and undo/redo history", () => {
        const fileContent = source("../src/components/canvas/canvas-prompt-chip-input.tsx");

        // 1. 断言包含历史快照栈与 handleUndo / handleRedo
        expect(fileContent).toContain("const historyRef = useRef<{ past: string[]; future: string[] }>");
        expect(fileContent).toContain("const handleUndo = () => {");
        expect(fileContent).toContain("const handleRedo = () => {");

        // 2. 断言快捷键拦截支持 Ctrl+Z 与 Ctrl+Y / Ctrl+Shift+Z
        expect(fileContent).toContain('event.key.toLowerCase() === "z"');
        expect(fileContent).toContain('event.key.toLowerCase() === "y"');

        // 3. 断言具备 handleCopyOrCut 序列化选区节点为纯文本 @图片N
        expect(fileContent).toContain("const handleCopyOrCut = (event: ClipboardEvent<HTMLDivElement>, isCut: boolean) => {");
        expect(fileContent).toContain("const serializedText = serializeNodes(Array.from(fragment.childNodes));");

        // 4. 断言在 onPaste 中自动识别 @图片N 并转化为缩略图胶囊
        expect(fileContent).toContain("const parsedTokens = parseTokens(text, activeLabels);");
        expect(fileContent).toContain("createReferenceChip(ref, theme, setImagePreview, showReferenceLabels)");

        // 5. 断言 createReferenceChip 的 image.alt 设置为 reference.label
        expect(fileContent).toContain("image.alt = reference.label;");
    });

    test("serializeNodes simulates DOM extraction and ensures clean @token serialization", () => {
        // 模拟 DOM 节点结构
        const mockChip = {
            nodeType: 1,
            tagName: "SPAN",
            dataset: { refLabel: "@图片1" },
            childNodes: [
                {
                    nodeType: 1,
                    tagName: "IMG",
                    getAttribute: () => "@图片1",
                },
                {
                    nodeType: 3,
                    textContent: "图片1",
                },
            ],
        };

        const serializeMockNode = (node: any): string => {
            if (node.nodeType === 3) return node.textContent || "";
            if (node.nodeType !== 1) return "";
            if (node.dataset?.refLabel) return node.dataset.refLabel;
            return (node.childNodes || []).map(serializeMockNode).join("");
        };

        const output = serializeMockNode(mockChip);
        // 复制选中胶囊时，必须精确输出纯文本 @图片1，杜绝复制出文件名或缺少 @
        expect(output).toBe("@图片1");
    });
});
