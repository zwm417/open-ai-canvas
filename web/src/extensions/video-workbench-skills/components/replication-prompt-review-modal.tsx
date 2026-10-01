// @opc-feature: replication-prompt-review-modal [start]
import React, { useState, useEffect } from "react";
import { Modal, Button, Input, message, Progress } from "antd";
import {
    Check,
    Copy,
    Sparkles,
    Film,
    ArrowRight,
    LoaderCircle,
    AlertCircle,
    Minimize2,
} from "lucide-react";
import { useDeepReplicationTaskStore } from "../stores/use-deep-replication-task-store";
import { CanvasPromptChipInput } from "@/components/canvas/canvas-prompt-chip-input";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";

interface ReplicationPromptReviewModalProps {
    open?: boolean;
    initialPrompt?: string;
    onClose: () => void;
    onApply: (editedPrompt: string) => void;
    references?: CanvasResourceReference[];
}

export const ReplicationPromptReviewModal: React.FC<ReplicationPromptReviewModalProps> = ({
    open: propOpen,
    initialPrompt = "",
    onClose,
    onApply,
    references = [],
}) => {
    const store = useDeepReplicationTaskStore();
    const isOpen = propOpen !== undefined ? propOpen : store.modalOpen;

    const [promptText, setPromptText] = useState(store.draftPrompt || initialPrompt);
    const [copied, setCopied] = useState(false);

    // 当任务完成或打开弹窗时同步提示词
    useEffect(() => {
        if (isOpen) {
            const nextText = store.draftPrompt || store.result?.prompt || initialPrompt;
            setPromptText(nextText);
            setCopied(false);
        }
    }, [isOpen, store.draftPrompt, store.result, initialPrompt]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(promptText);
            setCopied(true);
            message.success("提示词已复制到剪切板");
            setTimeout(() => setCopied(false), 2000);
        } catch {
            message.error("复制失败，请手动选取复制");
        }
    };

    const handleApply = () => {
        const trimmed = promptText.trim();
        if (!trimmed) {
            message.warning("提示词内容不能为空");
            return;
        }
        store.setDraftPrompt(trimmed);
        store.setModalOpen(false);
        onApply(trimmed);
    };

    const isRunning = store.status === "running";
    const isCompleted = store.status === "completed" || Boolean(store.result) || (!isRunning && Boolean(initialPrompt));
    const isFailed = store.status === "failed";

    return (
        <Modal
            open={isOpen}
            onCancel={onClose}
            width={720}
            title={
                <div className="flex items-center gap-2 text-base font-semibold">
                    {isRunning ? (
                        <>
                            <Sparkles className="size-5 text-amber-500 animate-spin" />
                            <span>复刻助手正在深度分析中</span>
                        </>
                    ) : (
                        <>
                            <Film className="size-5 text-amber-500" />
                            <span>Seedance-2.0 深度复刻提示词</span>
                        </>
                    )}
                </div>
            }
            footer={
                isRunning ? (
                    <div className="flex items-center justify-between pt-2">
                        <span className="text-xs text-stone-400">
                            ⚡ 后台持续执行中，关闭弹窗不影响任务进度
                        </span>
                        <Button
                            type="default"
                            icon={<Minimize2 className="size-3.5" />}
                            onClick={onClose}
                        >
                            后台运行并关闭
                        </Button>
                    </div>
                ) : (
                    <div className="flex items-center justify-between pt-2">
                        <Button
                            type="default"
                            icon={copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                            onClick={handleCopy}
                            disabled={!promptText.trim()}
                        >
                            {copied ? "已复制" : "复制提示词"}
                        </Button>
                        <div className="flex items-center gap-2.5">
                            <Button onClick={onClose}>关闭</Button>
                            <Button
                                type="primary"
                                className="!bg-gradient-to-r !from-amber-500 !to-orange-500 hover:!from-amber-600 hover:!to-orange-600 border-none shadow-sm"
                                icon={<ArrowRight className="size-4" />}
                                onClick={handleApply}
                                disabled={!promptText.trim()}
                            >
                                立即应用
                            </Button>
                        </div>
                    </div>
                )
            }
            destroyOnClose={false}
            centered
        >
            <div className="py-2 space-y-4">
                {/* 1. 运行中态：专业进度指示器（用户不可取消） */}
                {isRunning && (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-500/30 bg-amber-50/30 py-10 px-6 dark:bg-amber-950/10">
                        <div className="relative mb-4 flex size-14 items-center justify-center">
                            <LoaderCircle className="size-12 animate-spin text-amber-500 opacity-80" />
                            <Sparkles className="absolute size-5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="mb-1 text-sm font-semibold text-stone-800 dark:text-stone-200">
                            AI 正在解构原片镜头与多模态素材
                        </div>
                        <p className="mb-4 max-w-md text-center text-xs text-stone-500 dark:text-stone-400">
                            {store.progressMessage || "正在解析视频关键帧并对齐实体特征..."}
                        </p>
                        <div className="w-full max-w-xs mb-3">
                            <Progress
                                percent={store.progressPercent}
                                strokeColor={{ "0%": "#f59e0b", "100%": "#ea580c" }}
                                size="small"
                            />
                        </div>
                        <p className="text-[11px] text-stone-400 dark:text-stone-500">
                            🔒 任务已锁定并在后台独立执行，您可随意切换页面或浏览其他生成记录
                        </p>
                    </div>
                )}

                {/* 2. 失败态 */}
                {isFailed && !isRunning && (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/50 p-6 text-center dark:border-rose-900/50 dark:bg-rose-950/20">
                        <AlertCircle className="size-8 text-rose-500 mb-2" />
                        <div className="text-sm font-semibold text-rose-800 dark:text-rose-300">
                            复刻分析未成功
                        </div>
                        <p className="mt-1 max-w-md text-xs text-rose-600 dark:text-rose-400">
                            {store.errorText || "未能获取分析结果，请检查模型接入配置或视频格式"}
                        </p>
                    </div>
                )}

                {/* 3. 完成态：转为大文本框可编辑展示 */}
                {isCompleted && !isRunning && (
                    <div className="space-y-3">
                        <div className="rounded-lg bg-amber-50/70 p-2.5 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/50 flex items-start gap-2">
                            <Sparkles className="size-4 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                                <span className="font-semibold">Seedance-2.0 专属工业级指令已生成：</span>
                                已针对参考视频的时序运镜、多模态实体映射与因果连锁演进完成深度推演。您可直接在下方文本框内修改，也可以点击右下角
                                <span className="font-semibold underline mx-1">立即应用</span>
                                回填到“深度复刻”页面继续微调，随后点击下方【立即生成视频】。
                            </div>
                        </div>

                        <div className="relative rounded-xl border border-stone-200 bg-stone-50/70 p-3.5 dark:border-stone-800 dark:bg-[#232326]">
                            <CanvasPromptChipInput
                                value={promptText}
                                references={references}
                                onChange={(val) => {
                                    setPromptText(val);
                                    store.setDraftPrompt(val);
                                }}
                                showReferenceLabels
                                className="min-h-[220px] max-h-[360px] font-mono text-sm leading-6 !border-0 !p-0 !shadow-none !bg-transparent focus:!shadow-none text-stone-900 dark:text-stone-100"
                                placeholder="请输入复刻提示词..."
                                placeholderClassName="left-0 top-0 text-stone-400 dark:text-stone-500"
                            />
                            <div className="mt-2 flex items-center justify-between border-t border-black/[0.04] pt-2 text-xs text-stone-400 dark:border-white/[0.04]">
                                <span>💡 支持自由增改三段式指令，输入 @ 可快速关联素材并查看缩略图</span>
                                <span>{promptText.length} 字</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};
// @opc-feature: replication-prompt-review-modal [end]
