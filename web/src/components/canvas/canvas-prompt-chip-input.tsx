import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, CSSProperties, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Image } from "antd";
import { FileText, Image as ImageIcon, Music2, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { isImeComposing, isPlainEnterKey } from "@/lib/keyboard-event";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";

type Props = {
    value: string;
    references: CanvasResourceReference[];
    onChange: (value: string) => void;
    onSubmit?: () => void;
    className?: string;
    style?: CSSProperties;
    placeholder?: string;
    placeholderClassName?: string;
    showReferenceLabels?: boolean;
};

type MentionState = {
    query: string;
    rect: DOMRect | null;
};

type Token =
    | { type: "text"; value: string }
    | { type: "reference"; label: string };

export function CanvasPromptChipInput({ value, references, onChange, onSubmit, className, style, placeholder, placeholderClassName, showReferenceLabels = false }: Props) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)] || canvasThemes.dark;
    const editorRef = useRef<HTMLDivElement>(null);
    const composingRef = useRef(false);
    const lastEmittedRef = useRef(value);
    const [mention, setMention] = useState<MentionState | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    const activeReferences = useMemo(() => references.filter((item) => item.active), [references]);
    const referenceByLabel = useMemo(() => new Map(activeReferences.map((item) => [item.label, item])), [activeReferences]);
    const activeLabels = useMemo(() => Array.from(new Set(activeReferences.map((item) => item.label))).sort((a, b) => b.length - a.length), [activeReferences]);
    const tokens = useMemo(() => parseTokens(value, activeLabels), [value, activeLabels]);

    const candidates = useMemo(() => {
        if (!mention) return [];
        const query = mention.query.trim().toLowerCase();
        if (!query) return activeReferences;
        return activeReferences.filter((item) => `${item.label} ${item.title} ${item.kind} ${item.text || ""}`.toLowerCase().includes(query));
    }, [mention, activeReferences]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        if (document.activeElement === editor && value === lastEmittedRef.current) return;
        editor.textContent = "";
        tokens.forEach((token) => {
            if (token.type === "text") {
                editor.append(document.createTextNode(token.value));
                return;
            }
            const reference = referenceByLabel.get(token.label);
            if (reference) editor.append(createReferenceChip(reference, theme, setImagePreview, showReferenceLabels));
            else editor.append(document.createTextNode(token.label));
        });
        lastEmittedRef.current = value;
    }, [showReferenceLabels, tokens, referenceByLabel, theme, value]);

    const emit = (next: string) => {
        lastEmittedRef.current = next;
        onChange(next);
    };

    const syncFromEditor = () => {
        const editor = editorRef.current;
        if (!editor) return;
        emit(serializeEditor(editor));
        syncMention();
    };

    const syncMention = () => {
        const text = textBeforeCaret();
        const match = /@([^\s@]*)$/.exec(text);
        if (!match || !activeReferences.length) {
            closeMention();
            return;
        }
        setMention({ query: match[1] || "", rect: caretRect() });
        setActiveIndex(0);
    };

    const closeMention = () => {
        setMention(null);
        setActiveIndex(0);
    };

    // @opc-feature: canvas-prompt-chip-clipboard-and-undo [start]
    const historyRef = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
    const lastInputTimeRef = useRef<number>(0);

    const recordHistorySnapshot = () => {
        const editor = editorRef.current;
        if (!editor) return;
        const current = serializeEditor(editor);
        const past = historyRef.current.past;
        if (!past.length || past[past.length - 1] !== current) {
            past.push(current);
            if (past.length > 60) past.shift();
        }
        historyRef.current.future = [];
    };

    const restoreEditorContent = (text: string) => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.textContent = "";
        const restoredTokens = parseTokens(text, activeLabels);
        restoredTokens.forEach((token) => {
            if (token.type === "text") {
                const lines = token.value.split("\n");
                lines.forEach((line, lIdx) => {
                    if (lIdx > 0) editor.append(document.createElement("br"));
                    if (line) editor.append(document.createTextNode(line));
                });
            } else {
                const reference = referenceByLabel.get(token.label);
                if (reference) {
                    editor.append(createReferenceChip(reference, theme, setImagePreview, showReferenceLabels));
                } else {
                    editor.append(document.createTextNode(token.label));
                }
            }
        });
        placeCaretAtEnd(editor);
        emit(text);
    };

    const handleUndo = () => {
        const editor = editorRef.current;
        if (!editor || !historyRef.current.past.length) return;
        const current = serializeEditor(editor);
        const previous = historyRef.current.past.pop()!;
        historyRef.current.future.push(current);
        restoreEditorContent(previous);
    };

    const handleRedo = () => {
        const editor = editorRef.current;
        if (!editor || !historyRef.current.future.length) return;
        const current = serializeEditor(editor);
        const next = historyRef.current.future.pop()!;
        historyRef.current.past.push(current);
        restoreEditorContent(next);
    };

    const handleCopyOrCut = (event: ClipboardEvent<HTMLDivElement>, isCut: boolean) => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const editor = editorRef.current;
        if (!editor || !editor.contains(range.commonAncestorContainer)) return;

        const fragment = range.cloneContents();
        const serializedText = serializeNodes(Array.from(fragment.childNodes));
        if (serializedText) {
            event.preventDefault();
            event.clipboardData.setData("text/plain", serializedText);
            if (isCut) {
                recordHistorySnapshot();
                range.deleteContents();
                syncFromEditor();
            }
        }
    };
    // @opc-feature: canvas-prompt-chip-clipboard-and-undo [end]

    const insertReference = (reference: CanvasResourceReference) => {
        const editor = editorRef.current;
        if (!editor) return;
        recordHistorySnapshot();
        removeActiveMention();
        const chip = createReferenceChip(reference, theme, setImagePreview, showReferenceLabels);
        const space = document.createTextNode(" ");
        const selection = window.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        if (range) {
            range.insertNode(space);
            range.insertNode(chip);
            range.setStartAfter(space);
            range.collapse(true);
            selection?.removeAllRanges();
            selection?.addRange(range);
        } else {
            editor.append(chip, space);
            placeCaretAtEnd(editor);
        }
        closeMention();
        emit(serializeEditor(editor));
    };

    const showPlaceholder = !value.trim();

    return (
        <div className="relative flex min-h-0 w-full flex-1 flex-col">
            {showPlaceholder && placeholder ? (
                <div className={`pointer-events-none absolute text-sm leading-5 ${placeholderClassName || "left-3 top-2"}`} style={{ color: theme.node.placeholder }}>
                    {placeholder}
                </div>
            ) : null}
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                className={`${className || ""} h-full min-h-0 w-full overflow-y-auto whitespace-pre-wrap break-words outline-none`}
                style={{ ...style, cursor: "text" }}
                onInput={() => {
                    if (!composingRef.current) {
                        const now = Date.now();
                        if (now - lastInputTimeRef.current > 800) {
                            recordHistorySnapshot();
                        }
                        lastInputTimeRef.current = now;
                        syncFromEditor();
                    }
                }}
                onCompositionStart={() => {
                    composingRef.current = true;
                }}
                onCompositionEnd={() => {
                    composingRef.current = false;
                    syncFromEditor();
                }}
                // @opc-feature: canvas-prompt-chip-clipboard-and-undo [start]
                onCopy={(event: ClipboardEvent<HTMLDivElement>) => {
                    handleCopyOrCut(event, false);
                }}
                onCut={(event: ClipboardEvent<HTMLDivElement>) => {
                    handleCopyOrCut(event, true);
                }}
                onPaste={(event: ClipboardEvent<HTMLDivElement>) => {
                    event.preventDefault();
                    const text = event.clipboardData.getData("text/plain");
                    if (!text) return;

                    recordHistorySnapshot();

                    const selection = window.getSelection();
                    if (!selection?.rangeCount) return;
                    const range = selection.getRangeAt(0);
                    range.deleteContents();

                    const parsedTokens = parseTokens(text, activeLabels);
                    const hasReference = parsedTokens.some((token) => token.type === "reference" && referenceByLabel.has(token.label));

                    if (hasReference) {
                        const fragment = document.createDocumentFragment();
                        let lastNode: Node | null = null;
                        parsedTokens.forEach((token) => {
                            if (token.type === "text") {
                                const lines = token.value.split("\n");
                                lines.forEach((line, lIdx) => {
                                    if (lIdx > 0) {
                                        const br = document.createElement("br");
                                        fragment.appendChild(br);
                                        lastNode = br;
                                    }
                                    if (line) {
                                        const tn = document.createTextNode(line);
                                        fragment.appendChild(tn);
                                        lastNode = tn;
                                    }
                                });
                            } else {
                                const ref = referenceByLabel.get(token.label);
                                if (ref) {
                                    const chip = createReferenceChip(ref, theme, setImagePreview, showReferenceLabels);
                                    fragment.appendChild(chip);
                                    lastNode = chip;
                                } else {
                                    const tn = document.createTextNode(token.label);
                                    fragment.appendChild(tn);
                                    lastNode = tn;
                                }
                            }
                        });
                        range.insertNode(fragment);
                        if (lastNode) {
                            range.setStartAfter(lastNode);
                            range.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(range);
                        }
                    } else {
                        if (typeof document !== "undefined" && document.queryCommandSupported?.("insertText")) {
                            document.execCommand("insertText", false, text);
                        } else {
                            const textNode = document.createTextNode(text);
                            range.insertNode(textNode);
                            range.setStartAfter(textNode);
                            range.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(range);
                        }
                    }
                    syncFromEditor();
                }}
                // @opc-feature: canvas-prompt-chip-clipboard-and-undo [end]
                onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                    event.stopPropagation();
                    if (isImeComposing(event)) return;
                    // @opc-feature: canvas-prompt-chip-clipboard-and-undo [start]
                    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
                        if (event.shiftKey) {
                            if (historyRef.current.future.length > 0) {
                                event.preventDefault();
                                handleRedo();
                                return;
                            }
                        } else {
                            if (historyRef.current.past.length > 0) {
                                event.preventDefault();
                                handleUndo();
                                return;
                            }
                        }
                    }
                    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
                        if (historyRef.current.future.length > 0) {
                            event.preventDefault();
                            handleRedo();
                            return;
                        }
                    }
                    // @opc-feature: canvas-prompt-chip-clipboard-and-undo [end]
                    if (mention && candidates.length) {
                        if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setActiveIndex((index) => (index + 1) % candidates.length);
                            return;
                        }
                        if (event.key === "ArrowUp") {
                            event.preventDefault();
                            setActiveIndex((index) => (index - 1 + candidates.length) % candidates.length);
                            return;
                        }
                        if (event.key === "Enter") {
                            event.preventDefault();
                            insertReference(candidates[Math.min(activeIndex, candidates.length - 1)]);
                            return;
                        }
                        if (event.key === "Escape") {
                            event.preventDefault();
                            closeMention();
                            return;
                        }
                    }
                    if (event.key === "Backspace" || event.key === "Delete") {
                        recordHistorySnapshot();
                        if (deleteAdjacentReference(event.key)) {
                            event.preventDefault();
                            requestAnimationFrame(syncFromEditor);
                            return;
                        }
                    }
                    if (isPlainEnterKey(event) && onSubmit) {
                        event.preventDefault();
                        onSubmit();
                        return;
                    }
                    requestAnimationFrame(syncMention);
                }}
                onBlur={() => window.setTimeout(closeMention, 120)}
            />
            {mention && candidates.length ? (
                <MentionMenu rect={mention.rect} references={candidates} activeIndex={Math.min(activeIndex, candidates.length - 1)} theme={theme} onSelect={insertReference} />
            ) : null}
            {imagePreview ? <Image src={imagePreview} alt="预览" style={{ display: "none" }} preview={{ visible: true, src: imagePreview, onVisibleChange: (visible) => !visible && setImagePreview(null) }} /> : null}
        </div>
    );
}

function MentionMenu({ rect, references, activeIndex, theme, onSelect }: { rect: DOMRect | null; references: CanvasResourceReference[]; activeIndex: number; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onSelect: (reference: CanvasResourceReference) => void }) {
    const selectedRef = useRef(false);
    const activeItemRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        activeItemRef.current?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, references]);

    const selectReference = (reference: CanvasResourceReference) => {
        if (selectedRef.current) return;
        selectedRef.current = true;
        onSelect(reference);
    };

    const stopCanvasInteraction = (event: PointerEvent | MouseEvent) => event.stopPropagation();

    const menuWidth = 256;
    const maxMenuHeight = 224;
    const gap = 6;
    const anchor = rect || new DOMRect(16, 16, 0, 0);
    const left = clamp(anchor.left, 8, window.innerWidth - menuWidth - 8);
    const showAbove = anchor.bottom + gap + maxMenuHeight > window.innerHeight && anchor.top - gap - maxMenuHeight >= 0;
    const top = showAbove ? anchor.top - gap - maxMenuHeight : anchor.bottom + gap;

    return createPortal(
        <div
            data-canvas-resource-mention-menu="true"
            className="fixed z-[1100] max-h-56 w-64 overflow-y-auto rounded-xl border p-1 shadow-2xl backdrop-blur-md"
            style={{ left, top, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={stopCanvasInteraction}
            onMouseDown={stopCanvasInteraction}
            onClick={(event) => event.stopPropagation()}
        >
            {references.map((reference, index) => (
                <button
                    key={reference.id}
                    ref={index === activeIndex ? activeItemRef : undefined}
                    type="button"
                    className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition"
                    style={{ background: index === activeIndex ? theme.toolbar.activeBg : "transparent", color: index === activeIndex ? theme.toolbar.activeText : theme.node.text }}
                    onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectReference(reference);
                    }}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectReference(reference);
                    }}
                >
                    <ReferencePreview reference={reference} />
                    <span className="min-w-0 flex-1">
                        <span className="block font-medium">{reference.label}</span>
                        <span className="block truncate opacity-65">{reference.text || reference.title}</span>
                    </span>
                </button>
            ))}
        </div>,
        document.body,
    );
}

function ReferencePreview({ reference }: { reference: CanvasResourceReference }) {
    if (reference.kind === "image" && reference.previewUrl) return <img src={reference.previewUrl} alt="" className="size-9 rounded-md object-cover" />;
    if (reference.kind === "video" && reference.previewUrl) return <video src={reference.previewUrl} className="size-9 rounded-md bg-black object-cover" muted preload="metadata" />;
    const Icon = reference.kind === "audio" ? Music2 : reference.kind === "video" ? Video : reference.kind === "image" ? ImageIcon : FileText;
    return (
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/10">
            <Icon className="size-4" />
        </span>
    );
}

function createReferenceChip(reference: CanvasResourceReference, theme: (typeof canvasThemes)[keyof typeof canvasThemes], onImagePreview: (url: string) => void, showLabel = false) {
    const wrapper = document.createElement("span");
    wrapper.contentEditable = "false";
    wrapper.dataset.refLabel = reference.label;
    if (reference.kind === "image" && reference.previewUrl) {
        const image = document.createElement("img");
        image.src = reference.previewUrl;
        image.alt = reference.label;
        image.className = "size-6 rounded object-cover cursor-pointer";
        wrapper.className = showLabel ? "mx-px inline-flex h-6 max-w-40 items-center gap-1 overflow-hidden rounded-md border px-1 align-middle" : "mx-px inline-flex size-6 items-center justify-center overflow-hidden rounded align-middle";
        if (showLabel) Object.assign(wrapper.style, { background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text } as CSSProperties);
        wrapper.title = reference.title ? `${reference.label} (${reference.title})` : reference.label;
        wrapper.appendChild(image);
        if (showLabel) {
            const text = document.createElement("span");
            text.className = "block truncate text-xs leading-none";
            text.textContent = reference.label.replace(/^@/, "");
            wrapper.appendChild(text);
        }
        wrapper.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onImagePreview(reference.previewUrl || "");
        });
    } else if (reference.kind === "video" && reference.previewUrl) {
        const video = document.createElement("video");
        video.src = reference.previewUrl;
        video.muted = true;
        video.preload = "metadata";
        video.className = "size-6 rounded object-cover";
        wrapper.className = showLabel ? "mx-px inline-flex h-6 max-w-40 items-center gap-1 overflow-hidden rounded-md border px-1 align-middle" : "mx-px inline-flex size-6 items-center justify-center overflow-hidden rounded align-middle";
        if (showLabel) Object.assign(wrapper.style, { background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text } as CSSProperties);
        wrapper.appendChild(video);
        if (showLabel) {
            const text = document.createElement("span");
            text.className = "block truncate text-xs leading-none";
            text.textContent = reference.label.replace(/^@/, "");
            wrapper.appendChild(text);
        }
        wrapper.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onImagePreview(reference.previewUrl || "");
        });
    } else if (reference.kind === "text") {
        // 缩略文档显示：精致带文档图标与标题截断的 Document Chip
        wrapper.className = "mx-0.5 inline-flex h-6 max-w-[240px] items-center gap-1.5 overflow-hidden rounded-md border px-1.5 text-xs leading-none align-middle select-none shadow-xs cursor-default";
        Object.assign(wrapper.style, { 
            background: theme.toolbar.panel, 
            borderColor: theme.node.stroke, 
            color: theme.node.text 
        } as CSSProperties);
        
        // Tooltip: 鼠标悬停显示完整提示词内容
        wrapper.title = reference.text 
            ? `【${reference.title || reference.label}】\n\n${reference.text}`
            : (reference.title || reference.label);

        // Document Icon
        const iconSpan = document.createElement("span");
        iconSpan.className = "flex items-center text-amber-500 dark:text-amber-400 shrink-0";
        iconSpan.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`;
        wrapper.appendChild(iconSpan);

        // Document Label & Title
        const text = document.createElement("span");
        text.className = "block truncate font-medium";
        const displayTitle = reference.title && reference.title !== reference.label
            ? (showLabel ? `${reference.label.replace(/^@/, "")}: ${reference.title}` : reference.title)
            : reference.label.replace(/^@/, "");
        text.textContent = displayTitle;
        wrapper.appendChild(text);
    } else {
        wrapper.className = "mx-px inline-flex h-6 max-w-40 items-center justify-center overflow-hidden rounded-md border px-1 text-xs leading-none align-middle";
        Object.assign(wrapper.style, { background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text } as CSSProperties);
        wrapper.title = reference.text || reference.title;
        const text = document.createElement("span");
        text.className = "block truncate";
        text.textContent = reference.label.replace(/^@/, "");
        wrapper.appendChild(text);
    }
    return wrapper;
}

// @opc-feature: canvas-prompt-newline-preservation [start]
function isBlockElement(node: Node): boolean {
    if (!(node instanceof HTMLElement)) return false;
    const tag = node.tagName.toUpperCase();
    return (
        tag === "DIV" ||
        tag === "P" ||
        tag === "LI" ||
        tag === "TR" ||
        tag === "BLOCKQUOTE" ||
        tag === "H1" ||
        tag === "H2" ||
        tag === "H3" ||
        tag === "H4" ||
        tag === "H5" ||
        tag === "H6"
    );
}

function serializeBlockChildren(children: ChildNode[]): string {
    if (!children.length) return "";
    if (children.length === 1 && children[0] instanceof HTMLElement && children[0].tagName === "BR") return "";

    const lastIdx = children.length - 1;
    let text = "";
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.nodeType === Node.TEXT_NODE) {
            text += child.textContent || "";
        } else if (child instanceof HTMLElement) {
            const elem = child as HTMLElement;
            const label = elem.dataset.refLabel || elem.dataset.referenceToken;
            if (label) {
                text += label;
            } else if (elem.tagName === "BR") {
                if (i === lastIdx && lastIdx > 0) {
                    continue; // 忽略 Chrome 在块级元素末尾追加的占位 bogus BR
                }
                text += "\n";
            } else if (isBlockElement(elem)) {
                if (text.length > 0 && !text.endsWith("\n")) text += "\n";
                text += serializeBlockChildren(Array.from(elem.childNodes));
            } else {
                text += serializeBlockChildren(Array.from(elem.childNodes));
            }
        }
    }
    return text;
}

function serializeEditor(editor: HTMLElement) {
    return serializeNodes(editor.childNodes).replace(/﻿/g, "");
}

function serializeNodes(nodes: NodeListOf<ChildNode> | ChildNode[]) {
    const list = Array.from(nodes);
    let result = "";

    for (let i = 0; i < list.length; i++) {
        const node = list[i];
        const isLast = i === list.length - 1;

        if (node.nodeType === Node.TEXT_NODE) {
            result += node.textContent || "";
        } else if (node instanceof HTMLElement) {
            const elem = node as HTMLElement;
            const label = elem.dataset.refLabel || elem.dataset.referenceToken;
            if (label) {
                result += label;
            } else if (elem.tagName === "BR") {
                result += "\n";
            } else if (isBlockElement(elem)) {
                if (result.length > 0 && !result.endsWith("\n")) {
                    result += "\n";
                }
                const blockText = serializeBlockChildren(Array.from(elem.childNodes));
                result += blockText;
                if (!isLast) {
                    if (blockText === "" || !result.endsWith("\n")) {
                        result += "\n";
                    }
                }
            } else {
                result += serializeNodes(elem.childNodes);
            }
        }
    }

    return result;
}
// @opc-feature: canvas-prompt-newline-preservation [end]

function removeActiveMention() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const text = textBeforeCaret();
    const match = /@([^\s@]*)$/.exec(text);
    if (!match) return;
    range.setStart(range.startContainer, Math.max(0, range.startOffset - (match[1] || "").length - 1));
    range.deleteContents();
}

function deleteAdjacentReference(key: string) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return false;
    const range = selection.getRangeAt(0);
    const target = adjacentReferenceNode(range, key);
    if (!target) return false;
    const nextCaretNode = document.createTextNode("");
    target.replaceWith(nextCaretNode);
    range.setStart(nextCaretNode, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
}

function adjacentReferenceNode(range: Range, key: string) {
    const container = range.startContainer;
    const offset = range.startOffset;
    const previous = key === "Backspace";
    if (container.nodeType === Node.TEXT_NODE) {
        const text = container.textContent || "";
        if ((previous && offset > 0) || (!previous && offset < text.length)) return null;
        return findReferenceSibling(container, previous);
    }
    const children = Array.from(container.childNodes);
    return findReferenceSibling(children[previous ? offset - 1 : offset] || container, previous, true);
}

function findReferenceSibling(node: Node, previous: boolean, includeSelf = false): HTMLElement | null {
    let current: Node | null = includeSelf ? node : previous ? node.previousSibling : node.nextSibling;
    while (current && current.nodeType === Node.TEXT_NODE && !(current.textContent || "").trim()) current = previous ? current.previousSibling : current.nextSibling;
    return current instanceof HTMLElement && current.dataset.refLabel ? current : null;
}

function textBeforeCaret() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return "";
    const range = selection.getRangeAt(0).cloneRange();
    const editor = closestEditor(range.startContainer);
    if (!editor) return "";
    range.setStart(editor, 0);
    return range.toString();
}

function caretRect(): DOMRect | null {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    if (rect.width || rect.height || rect.left || rect.top) return rect;
    const editor = closestEditor(range.startContainer);
    return editor ? editor.getBoundingClientRect() : null;
}

function closestEditor(node: Node) {
    const element = node instanceof Element ? node : node.parentElement;
    return element?.closest("[contenteditable='true']") || null;
}

function placeCaretAtEnd(element: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}

function parseTokens(value: string, labels: string[]): Token[] {
    if (!labels.length) return value ? [{ type: "text", value }] : [];
    const escaped = labels.map(escapeRegExp).join("|");
    const pattern = new RegExp(`(${escaped})`, "g");
    const tokens: Token[] = [];
    let lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
        if (match.index === undefined) continue;
        if (match.index > lastIndex) tokens.push({ type: "text", value: value.slice(lastIndex, match.index) });
        tokens.push({ type: "reference", label: match[0] });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) tokens.push({ type: "text", value: value.slice(lastIndex) });
    return tokens;
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clamp(value: number, min: number, max: number) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
}
