import { useState, useEffect } from "react";
import { App, Modal, Button, message as staticMessage } from "antd";
import { BookmarkPlus, SlidersHorizontal, Trash2 } from "lucide-react";

export type SavedPromptPreset = {
    id: string;
    title: string;
    content: string;
};

export type PromptEditorModalProps = {
    open: boolean;
    onClose: () => void;
    title?: string;
    nodeTitle?: string;
    initialMode?: "supplement" | "replace";
    supplementPrompt: string;
    replacePrompt: string;
    onSave: (result: {
        mode: "supplement" | "replace";
        supplementPrompt: string;
        replacePrompt: string;
    }) => void;
    savedPresets?: SavedPromptPreset[];
    onSavePreset?: (preset: SavedPromptPreset) => void;
    onDeletePreset?: (presetId: string) => void;
    supplementPlaceholder?: string;
    replacePlaceholder?: string;
};

export function PromptEditorModal({
    open,
    onClose,
    title = "提示词编辑",
    nodeTitle,
    initialMode = "supplement",
    supplementPrompt,
    replacePrompt,
    onSave,
    savedPresets = [],
    onSavePreset,
    onDeletePreset,
    supplementPlaceholder = "例如：\n1. 重点分析视频中人物的手部操作细节与道具受力反馈；\n2. 详细拆解 0-3 秒钩子画面与台词促转化机制；\n3. 输出换品后的具体商品拍摄建议...",
    replacePlaceholder = "在此输入您的自定义系统提示词（将完全替换内置规则）...",
}: PromptEditorModalProps) {
    const { message: appMessage } = App.useApp();
    const message = appMessage || staticMessage;
    const [mode, setMode] = useState<"supplement" | "replace">(initialMode);
    const [draftSupplement, setDraftSupplement] = useState(supplementPrompt);
    const [draftReplace, setDraftReplace] = useState(replacePrompt);

    useEffect(() => {
        if (open) {
            setMode(initialMode);
            setDraftSupplement(supplementPrompt);
            setDraftReplace(replacePrompt);
        }
    }, [open, initialMode, supplementPrompt, replacePrompt]);

    const handleSave = () => {
        onSave({
            mode,
            supplementPrompt: draftSupplement,
            replacePrompt: draftReplace,
        });
        onClose();
        message.success("已保存提示词配置");
    };

    const handleApplyPreset = (content: string) => {
        setDraftSupplement((prev) => {
            const trimmed = prev.trim();
            if (!trimmed) return content;
            if (trimmed.includes(content)) return prev;
            return `${trimmed}\n${content}`;
        });
    };

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            width={720}
            destroyOnClose
            title={
                <div className="flex items-center justify-between pr-8 select-none">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        <SlidersHorizontal className="size-4 text-amber-500" />
                        <span>{title}{nodeTitle ? ` · ${nodeTitle}` : ""}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setMode("supplement")}
                            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                                mode === "supplement"
                                    ? "bg-amber-500 text-white shadow-sm"
                                    : "bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700"
                            }`}
                        >
                            补充提示词
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode("replace")}
                            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                                mode === "replace"
                                    ? "bg-amber-500 text-white shadow-sm"
                                    : "bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700"
                            }`}
                        >
                            替换提示词
                        </button>
                    </div>
                </div>
            }
        >
            <div
                className="flex flex-col gap-3 pt-2 text-xs"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                    if (e.key !== "Escape") e.stopPropagation();
                }}
            >
                {/* 模式说明条 */}
                <div className="rounded-lg border p-2.5 bg-neutral-50 dark:bg-neutral-900/50 border-neutral-200 dark:border-neutral-800">
                    <span className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed">
                        {mode === "supplement" ? (
                            <>
                                <strong className="text-amber-600 dark:text-amber-400 font-semibold">补充提示词（推荐）：</strong>
                                系统内置的专业工业级规范将在后台保持生效，并在此基础上优先追加执行您在下方填写的关注重点与补充指令。
                            </>
                        ) : (
                            <>
                                <strong className="text-amber-600 dark:text-amber-400 font-semibold">替换提示词（完全覆盖）：</strong>
                                覆盖系统内置的所有预设规范，完全以您在下方填写的自定义系统提示词为准执行大模型调用。
                            </>
                        )}
                    </span>
                </div>

                {mode === "supplement" ? (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                💡 请在下方填写补充关注重点：
                            </span>
                            <div className="flex items-center gap-2">
                                {draftSupplement ? (
                                    <button
                                        type="button"
                                        onClick={() => setDraftSupplement("")}
                                        className="text-[11px] text-neutral-400 hover:text-rose-500 transition-colors"
                                    >
                                        清空内容
                                    </button>
                                ) : null}
                                {onSavePreset ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!draftSupplement.trim()) return;
                                            const firstLine = draftSupplement.trim().split("\n")[0].slice(0, 16);
                                            onSavePreset({
                                                id: `preset-${Date.now()}`,
                                                title: firstLine || "自定义预设",
                                                content: draftSupplement.trim(),
                                            });
                                        }}
                                        disabled={!draftSupplement.trim()}
                                        className="flex items-center gap-1 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 transition-colors hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-40 disabled:pointer-events-none"
                                    >
                                        <BookmarkPlus className="size-3 text-amber-500" />
                                        <span>保存为预设</span>
                                    </button>
                                ) : null}
                            </div>
                        </div>

                        <textarea
                            value={draftSupplement}
                            onChange={(e) => setDraftSupplement(e.target.value)}
                            placeholder={supplementPlaceholder}
                            rows={9}
                            className="w-full resize-y rounded-lg border p-3 font-sans text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100"
                        />

                        {/* 快捷预设展示 */}
                        {savedPresets.length > 0 ? (
                            <div className="flex flex-col gap-1.5 pt-1">
                                <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
                                    快捷预设库（点击直接追加至输入框）：
                                </span>
                                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                    {savedPresets.map((preset) => (
                                        <div
                                            key={preset.id}
                                            onClick={() => handleApplyPreset(preset.content)}
                                            title={preset.content}
                                            className="group flex items-center gap-1 rounded-full border border-amber-300 dark:border-amber-700 bg-white dark:bg-neutral-900 px-2.5 py-0.5 text-[11px] text-amber-800 dark:text-amber-200 cursor-pointer shadow-2xs transition-colors hover:bg-amber-500 hover:text-white"
                                        >
                                            <span>+ {preset.title}</span>
                                            {onDeletePreset ? (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDeletePreset(preset.id);
                                                    }}
                                                    className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/20 text-neutral-400 group-hover:text-white transition-colors"
                                                    title="删除此预设"
                                                >
                                                    <Trash2 className="size-2.5" />
                                                </button>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                💡 完全替换模式：大模型将仅使用下方输入作为系统提示词
                            </span>
                            {draftReplace ? (
                                <button
                                    type="button"
                                    onClick={() => setDraftReplace("")}
                                    className="text-[11px] text-neutral-400 hover:text-rose-500 transition-colors"
                                >
                                    清空内容
                                </button>
                            ) : null}
                        </div>

                        <textarea
                            value={draftReplace}
                            onChange={(e) => setDraftReplace(e.target.value)}
                            placeholder={replacePlaceholder}
                            rows={12}
                            className="w-full resize-y rounded-lg border p-3 font-mono text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 text-neutral-900 dark:text-neutral-100"
                        />
                    </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-neutral-200 dark:border-neutral-800">
                    <span className="text-[11px] text-neutral-400">
                        当前模式：{mode === "supplement" ? "补充提示词" : "替换提示词"}（字数：{mode === "supplement" ? draftSupplement.length : draftReplace.length}）
                    </span>
                    <div className="flex items-center gap-2">
                        <Button size="small" onClick={onClose}>
                            取消
                        </Button>
                        <Button
                            type="primary"
                            size="small"
                            className="!border-amber-500 !bg-amber-500 hover:!bg-amber-600"
                            onClick={handleSave}
                        >
                            保存配置
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
