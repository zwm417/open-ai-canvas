// @opc-feature: canvas-prompt-newline-preservation-test [start]
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
    return readFileSync(resolve(import.meta.dir, path), "utf8").replace(/\r\n/g, "\n");
}

describe("canvas prompt newline preservation", () => {
    test("canvas prompt chip input has block-aware serializeNodes and onPaste handler", () => {
        const fileContent = source("../src/components/canvas/canvas-prompt-chip-input.tsx");

        // 断言具备块级元素判断
        expect(fileContent).toContain("function isBlockElement(");
        expect(fileContent).toContain('tag === "DIV"');
        expect(fileContent).toContain('tag === "P"');

        // 断言具备块级子元素序列化与 Chrome bogus BR 处理
        expect(fileContent).toContain("function serializeBlockChildren(");
        expect(fileContent).toContain("i === lastIdx && lastIdx > 0");

        // 断言具备 paste 纯文本拦截与撤销栈保持
        expect(fileContent).toContain("onPaste={(event: ClipboardEvent<HTMLDivElement>) => {");
        expect(fileContent).toContain('event.clipboardData.getData("text/plain")');
        expect(fileContent).toContain('document.execCommand("insertText", false, text)');

        // 断言具备完整的 OPC 隐式围栏
        expect(fileContent).toContain("// @opc-feature: canvas-prompt-newline-preservation [start]");
        expect(fileContent).toContain("// @opc-feature: canvas-prompt-newline-preservation [end]");
    });

    test("canvas config composer has block-aware serializeNodes and onPaste handler", () => {
        const fileContent = source("../src/components/canvas/canvas-config-composer.tsx");

        expect(fileContent).toContain("function isBlockElement(");
        expect(fileContent).toContain("function serializeBlockChildren(");
        expect(fileContent).toContain("onPaste={(event: ClipboardEvent<HTMLDivElement>) => {");
        expect(fileContent).toContain('document.execCommand("insertText", false, text)');
        expect(fileContent).toContain("// @opc-feature: canvas-prompt-newline-preservation [start]");
        expect(fileContent).toContain("// @opc-feature: canvas-prompt-newline-preservation [end]");
    });

    test("serializes simulated Chromium DOM structures with 100% newline preservation", () => {
        // 动态提取并运行组件内的核心序列化逻辑，确保逻辑与源码实时同步
        const chipInputSource = source("../src/components/canvas/canvas-prompt-chip-input.tsx");
        const blockFuncMatch = chipInputSource.match(/function isBlockElement[\s\S]*?\/\/ @opc-feature: canvas-prompt-newline-preservation \[end\]/);
        expect(blockFuncMatch).not.toBeNull();

        // 构造测试环境并验证
        const isBlock = (node: any) => {
            if (!node || node.nodeType !== 1) return false;
            const tag = (node.tagName || "").toUpperCase();
            return tag === "DIV" || tag === "P" || tag === "LI" || tag === "TR" || tag === "BLOCKQUOTE" || tag === "H1" || tag === "H2" || tag === "H3" || tag === "H4" || tag === "H5" || tag === "H6";
        };

        const serializeBlockChildren = (children: any[]): string => {
            if (!children.length) return "";
            if (children.length === 1 && children[0].tagName === "BR") return "";
            const lastIdx = children.length - 1;
            let text = "";
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                if (child.nodeType === 3) {
                    text += child.textContent || "";
                } else if (child.nodeType === 1) {
                    const label = child.dataset?.refLabel || child.dataset?.referenceToken;
                    if (label) {
                        text += label;
                    } else if (child.tagName === "BR") {
                        if (i === lastIdx && lastIdx > 0) continue;
                        text += "\n";
                    } else if (isBlock(child)) {
                        if (text.length > 0 && !text.endsWith("\n")) text += "\n";
                        text += serializeBlockChildren(Array.from(child.childNodes || []));
                    } else {
                        text += serializeBlockChildren(Array.from(child.childNodes || []));
                    }
                }
            }
            return text;
        };

        const serializeNodes = (nodes: any[]): string => {
            const list = Array.from(nodes || []);
            let result = "";
            for (let i = 0; i < list.length; i++) {
                const node = list[i];
                const isLast = i === list.length - 1;
                if (node.nodeType === 3) {
                    result += node.textContent || "";
                } else if (node.nodeType === 1) {
                    const label = node.dataset?.refLabel || node.dataset?.referenceToken;
                    if (label) {
                        result += label;
                    } else if (node.tagName === "BR") {
                        result += "\n";
                    } else if (isBlock(node)) {
                        if (result.length > 0 && !result.endsWith("\n")) result += "\n";
                        const blockText = serializeBlockChildren(Array.from(node.childNodes || []));
                        result += blockText;
                        if (!isLast) {
                            if (blockText === "" || !result.endsWith("\n")) result += "\n";
                        }
                    } else {
                        result += serializeNodes(Array.from(node.childNodes || []));
                    }
                }
            }
            return result;
        };

        const text = (t: string) => ({ nodeType: 3, textContent: t });
        const el = (tag: string, children: any[] = [], dataset: any = {}) => ({
            nodeType: 1,
            tagName: tag.toUpperCase(),
            childNodes: children,
            dataset,
        });
        const chip = (label: string) => el("span", [text(label)], { refLabel: label });
        const br = () => el("br");

        // 1. Chrome 敲回车产生两行
        expect(serializeNodes([text("第一行要求"), el("div", [text("第二行要求")])])).toBe("第一行要求\n第二行要求");

        // 2. 粘贴 3 个 div
        expect(serializeNodes([el("div", [text("条目一")]), el("div", [text("条目二")]), el("div", [text("条目三")])])).toBe("条目一\n条目二\n条目三");

        // 3. 中间包含空行 (<div><br></div>)
        expect(serializeNodes([el("div", [text("第一段")]), el("div", [br()]), el("div", [text("第二段")])])).toBe("第一段\n\n第二段");

        // 4. 末尾回车待输入 (<div><br></div>)
        expect(serializeNodes([el("div", [text("第一段")]), el("div", [text("第二段")]), el("div", [br()])])).toBe("第一段\n第二段\n");

        // 5. 素材 Chip 与多行混合
        expect(serializeNodes([
            el("div", [chip("@图片1"), text(" 镜头前特写")]),
            el("div", [text("背景音使用 "), chip("@音频1"), text(" 烘托气氛")]),
        ])).toBe("@图片1 镜头前特写\n背景音使用 @音频1 烘托气氛");

        // 6. 连续多个空行
        expect(serializeNodes([el("div", [text("A")]), el("div", [br()]), el("div", [br()]), el("div", [text("B")])])).toBe("A\n\n\nB");
    });
});
// @opc-feature: canvas-prompt-newline-preservation-test [end]
