import { useMemo, useState } from "react";
import { App, Button, Input, Modal, Segmented, message as staticMessage } from "antd";
import {
    Check,
    Copy,
    Download,
    FileAudio,
    FileImage,
    FileText,
    FileVideo,
    Plus,
    RefreshCw,
    Save,
    Sparkles,
    Trash2,
} from "lucide-react";
import saveAs from "file-saver";
import type {
    CreationAssistantFileSummary,
    CreationAssistantInsightItem,
    CreationAssistantInsightSection,
} from "@/stores/use-creation-assistant-store";

type SourceMediaItem = {
    id: string;
    name: string;
    kind: "image" | "video" | "audio";
    url?: string;
    dataUrl?: string;
};

type Props = {
    open: boolean;
    onClose: () => void;
    initialFileSummaries: CreationAssistantFileSummary[];
    initialInsightSections: CreationAssistantInsightSection[];
    sourceMediaList: SourceMediaItem[];
    initialReportText: string;
    onSave: (updated: {
        fileSummaries: CreationAssistantFileSummary[];
        insightSections: CreationAssistantInsightSection[];
        reportText: string;
    }) => void;
};

export function MaterialAnalysisResultDialog({
    open,
    onClose,
    initialFileSummaries,
    initialInsightSections,
    sourceMediaList,
    initialReportText,
    onSave,
}: Props) {
    const { message: appMessage } = App.useApp();
    const message = appMessage || staticMessage;
    const [viewMode, setViewMode] = useState<"structured" | "report">("structured");
    const [fileSummaries, setFileSummaries] = useState<CreationAssistantFileSummary[]>(initialFileSummaries);
    const [insightSections, setInsightSections] = useState<CreationAssistantInsightSection[]>(initialInsightSections);
    const [reportText, setReportText] = useState<string>(initialReportText);
    const [copied, setCopied] = useState<boolean>(false);

    // 当弹窗打开时重置本地状态以同步外部最新传入
    useMemo(() => {
        if (open) {
            setFileSummaries(initialFileSummaries);
            setInsightSections(initialInsightSections);
            setReportText(initialReportText);
        }
    }, [open, initialFileSummaries, initialInsightSections, initialReportText]);

    const sourceMediaMap = useMemo(() => {
        const map = new Map<string, SourceMediaItem>();
        sourceMediaList.forEach((m) => map.set(m.id, m));
        return map;
    }, [sourceMediaList]);

    // 更新单个素材档案摘要
    const handleUpdateSummary = (fileId: string, summary: string) => {
        setFileSummaries((prev) =>
            prev.map((item) => (item.fileId === fileId ? { ...item, summary } : item)),
        );
    };

    // 洞察看板：更新条目内容
    const handleUpdateInsightItem = (sectionKey: string, itemId: string, text: string) => {
        setInsightSections((prev) =>
            prev.map((sec) =>
                sec.sectionKey === sectionKey
                    ? {
                          ...sec,
                          items: sec.items.map((it) =>
                              it.itemId === itemId ? { ...it, text, userEdited: true } : it,
                          ),
                      }
                    : sec,
            ),
        );
    };

    // 洞察看板：添加条目
    const handleAddInsightItem = (sectionKey: string) => {
        setInsightSections((prev) =>
            prev.map((sec) =>
                sec.sectionKey === sectionKey
                    ? {
                          ...sec,
                          items: [
                              ...sec.items,
                              {
                                  itemId: `insight-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                  text: "",
                                  sourceFileIds: [],
                                  confidence: 1,
                                  riskFlags: [],
                                  userEdited: true,
                              },
                          ],
                      }
                    : sec,
            ),
        );
    };

    // 洞察看板：删除条目
    const handleDeleteInsightItem = (sectionKey: string, itemId: string) => {
        setInsightSections((prev) =>
            prev.map((sec) =>
                sec.sectionKey === sectionKey
                    ? { ...sec, items: sec.items.filter((it) => it.itemId !== itemId) }
                    : sec,
            ),
        );
    };

    const refByFileId = useMemo(() => {
        const kindCounters: Record<string, number> = { image: 0, video: 0, audio: 0 };
        const map = new Map<string, string>();
        fileSummaries.forEach((s) => {
            const k = s.mediaType || "video";
            kindCounters[k] = (kindCounters[k] || 0) + 1;
            const prefix = k === "image" ? "图片" : k === "video" ? "视频" : "音频";
            map.set(s.fileId, `@${prefix}${kindCounters[k]}`);
        });
        return map;
    }, [fileSummaries]);

    // 从当前编辑的结构化数据重新生成文本报告
    const handleRegenerateReportText = () => {
        const kindCounters: Record<string, number> = { image: 0, video: 0, audio: 0 };
        const localRefMap = new Map<string, string>();
        fileSummaries.forEach((s) => {
            const k = s.mediaType || "video";
            kindCounters[k] = (kindCounters[k] || 0) + 1;
            const prefix = k === "image" ? "图片" : k === "video" ? "视频" : "音频";
            localRefMap.set(s.fileId, `@${prefix}${kindCounters[k]}`);
        });

        const generated = [
            "【素材分析报告】",
            `共分析 ${fileSummaries.length} 个素材文件：`,
            ...fileSummaries.map((s) => {
                const refToken = localRefMap.get(s.fileId) || "";
                const cleanSummary = (s.summary || "")
                    .replace(/\[[^\]]+?\.(?:png|jpe?g|webp|gif|mp4|webm|mp3|wav|m4a|aac)[^\]]*\]/gi, "")
                    .replace(/\[(?:产品图|图片|素材)[^\]]*\]/gi, "")
                    .replace(/\s{2,}/g, " ")
                    .trim();
                return `${refToken} ${cleanSummary}`;
            }),
            "",
            "【商品核心洞察】",
            ...insightSections.map((sec) => {
                const itemsText = sec.items
                    .map((it) => {
                        const refs = it.sourceFileIds?.map((id) => localRefMap.get(id)).filter(Boolean) || [];
                        const refSuffix = refs.length ? ` (依据素材: ${refs.join("、")})` : "";
                        return `  - ${it.text}${refSuffix}`;
                    })
                    .join("\n");
                return `■ ${sec.title}：\n${itemsText}`;
            }),
        ].join("\n");
        setReportText(generated);
        message.success("已根据当前结构化内容重新生成报告文本");
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(reportText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            message.success("已复制素材分析报告全文");
        } catch {
            message.error("复制失败，请手动选择复制");
        }
    };

    const handleExportJson = () => {
        const data = JSON.stringify(
            {
                version: "material-analysis-result.v1",
                generatedAt: Date.now(),
                fileSummaries,
                insightSections,
                reportText,
            },
            null,
            2,
        );
        const blob = new Blob([data], { type: "application/json;charset=utf-8" });
        saveAs(blob, `素材分析结果-${Date.now()}.json`);
        message.success("已导出素材分析结果 JSON");
    };

    const handleConfirmSave = () => {
        onSave({
            fileSummaries,
            insightSections,
            reportText,
        });
        message.success("已保存素材分析结果修改");
        onClose();
    };

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            width={1000}
            destroyOnClose
            styles={{
                body: { maxHeight: "calc(86vh - 80px)", overflowY: "auto", padding: "16px 20px" },
            }}
            title={
                <div className="flex flex-wrap items-center justify-between gap-3 pr-6 select-none">
                    <div className="flex items-center gap-2">
                        <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                            <Sparkles className="size-4" />
                        </div>
                        <div>
                            <div className="text-base font-semibold leading-none text-stone-900 dark:text-stone-100">
                                素材分析结果
                            </div>
                            <div className="mt-1 text-[11px] text-stone-400">
                                共 {fileSummaries.length} 个素材 · {insightSections.length} 个核心洞察板块
                            </div>
                        </div>
                    </div>

                    <Segmented
                        size="small"
                        value={viewMode}
                        onChange={(v) => setViewMode(v as "structured" | "report")}
                        options={[
                            { label: "结构化拆解与洞察", value: "structured" },
                            { label: "完整报告与下游输入", value: "report" },
                        ]}
                    />
                </div>
            }
        >
            <div
                className="flex flex-col gap-4 text-xs"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                    if (e.key !== "Escape") e.stopPropagation();
                }}
            >
                {viewMode === "structured" ? (
                    <div className="flex flex-col gap-5">
                        {/* 1. 素材档案拆解列表 */}
                        <div className="flex flex-col gap-2.5">
                            <div className="flex items-center justify-between border-b pb-1.5 border-stone-200 dark:border-stone-800">
                                <span className="font-semibold text-stone-800 dark:text-stone-200">
                                    素材档案拆解 ({fileSummaries.length})
                                </span>
                                <span className="text-[11px] text-stone-400">
                                    支持微调每个素材的特征识别与内容摘要
                                </span>
                            </div>

                            {fileSummaries.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-stone-200 p-4 text-center text-stone-400 dark:border-stone-800">
                                    暂无已分析的素材文件
                                </div>
                            ) : (
                                <div className="grid gap-2.5">
                                    {fileSummaries.map((item, idx) => {
                                        const media = sourceMediaMap.get(item.fileId);
                                        return (
                                            <div
                                                key={item.fileId || idx}
                                                className="flex items-start gap-3 rounded-lg border border-stone-200/90 bg-stone-50/50 p-3 dark:border-stone-800 dark:bg-stone-900/30"
                                            >
                                                {/* 缩略图预览 */}
                                                <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-stone-200/70 dark:bg-stone-800">
                                                    {media?.kind === "image" ? (
                                                        <img
                                                            src={media.dataUrl || media.url}
                                                            alt=""
                                                            className="size-full object-cover"
                                                        />
                                                    ) : media?.kind === "video" ? (
                                                        <video
                                                            src={media.url}
                                                            muted
                                                            preload="metadata"
                                                            className="size-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="grid size-full place-items-center text-stone-400">
                                                            <FileAudio className="size-6" />
                                                        </div>
                                                    )}
                                                    <span className="absolute left-1 top-1 rounded bg-amber-500/90 px-1 text-[9px] font-semibold text-white shadow-2xs">
                                                        {refByFileId.get(item.fileId) || `#${idx + 1}`}
                                                    </span>
                                                </div>

                                                {/* 文件描述与摘要编辑框 */}
                                                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="shrink-0 font-semibold text-amber-600 dark:text-amber-400 text-sm">
                                                                {refByFileId.get(item.fileId) || `#${idx + 1}`}
                                                            </span>
                                                            <span className="font-medium text-stone-700 dark:text-stone-300 truncate text-xs">
                                                                {item.mediaType === "video" ? "视频素材" : item.mediaType === "audio" ? "音频素材" : "图片素材"}
                                                            </span>
                                                        </div>
                                                        <span className="shrink-0 rounded bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                                                            {item.mediaType || media?.kind || "media"}
                                                        </span>
                                                    </div>
                                                    <Input.TextArea
                                                        value={item.summary}
                                                        onChange={(e) =>
                                                            handleUpdateSummary(item.fileId, e.target.value)
                                                        }
                                                        autoSize={{ minRows: 2, maxRows: 6 }}
                                                        placeholder="输入该素材的内容总结与识别特征..."
                                                        className="!text-sm leading-relaxed"
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* 2. 商品核心洞察看板 */}
                        <div className="flex flex-col gap-2.5">
                            <div className="flex items-center justify-between border-b pb-1.5 border-stone-200 dark:border-stone-800">
                                <span className="font-semibold text-stone-800 dark:text-stone-200">
                                    商品核心洞察看板 ({insightSections.length})
                                </span>
                                <span className="text-[11px] text-stone-400">
                                    按板块拆解的核心卖点、痛点、场景与受众特征
                                </span>
                            </div>

                            <div className="grid items-stretch gap-3 md:grid-cols-2">
                                {insightSections.map((sec) => (
                                    <div
                                        key={sec.sectionKey}
                                        className="flex flex-col gap-2 rounded-lg border border-stone-200/90 bg-stone-50/50 p-3 dark:border-stone-800 dark:bg-stone-900/30"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="font-semibold text-stone-800 dark:text-stone-200">
                                                {sec.title}
                                            </div>
                                            <Button
                                                type="text"
                                                size="small"
                                                icon={<Plus className="size-3.5" />}
                                                className="text-stone-500 hover:text-amber-500"
                                                onClick={() => handleAddInsightItem(sec.sectionKey)}
                                            >
                                                添加分析点
                                            </Button>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            {sec.items.map((it) => (
                                                <div key={it.itemId} className="flex items-start gap-1.5">
                                                    <Input.TextArea
                                                        value={it.text}
                                                        onChange={(e) =>
                                                            handleUpdateInsightItem(
                                                                sec.sectionKey,
                                                                it.itemId,
                                                                e.target.value,
                                                            )
                                                        }
                                                        autoSize={{ minRows: 1, maxRows: 5 }}
                                                        placeholder="核心提炼与洞察点..."
                                                        className="!text-sm leading-relaxed"
                                                    />
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        danger
                                                        icon={<Trash2 className="size-3.5" />}
                                                        onClick={() =>
                                                            handleDeleteInsightItem(sec.sectionKey, it.itemId)
                                                        }
                                                        className="mt-0.5 shrink-0"
                                                    />
                                                </div>
                                            ))}
                                            {sec.items.length === 0 ? (
                                                <div className="rounded border border-dashed border-stone-200 p-2 text-center text-[11px] text-stone-400 dark:border-stone-800">
                                                    暂无洞察条目，可点击上方添加
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    /* 完整报告文本视图 */
                    <div className="flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                            <span className="font-semibold text-stone-800 dark:text-stone-200">
                                完整多模态分析报告文本（下游节点将直接消费此内容）
                            </span>
                            <Button
                                size="small"
                                icon={<RefreshCw className="size-3" />}
                                onClick={handleRegenerateReportText}
                            >
                                同步结构化修改到文本
                            </Button>
                        </div>

                        <Input.TextArea
                            value={reportText}
                            onChange={(e) => setReportText(e.target.value)}
                            rows={18}
                            className="font-mono !text-[15px] leading-relaxed"
                            placeholder="分析报告全文..."
                        />
                    </div>
                )}

                {/* 底部功能条 */}
                <div className="sticky bottom-0 -mx-5 -mb-4 mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-white/95 px-5 py-3 backdrop-blur-md dark:border-stone-800 dark:bg-stone-900/95">
                    <div className="flex items-center gap-2">
                        <Button
                            size="small"
                            icon={copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                            onClick={handleCopy}
                        >
                            {copied ? "已复制" : "复制报告全文"}
                        </Button>
                        <Button
                            size="small"
                            icon={<Download className="size-3" />}
                            onClick={handleExportJson}
                        >
                            导出 JSON
                        </Button>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button size="small" onClick={onClose}>
                            取消
                        </Button>
                        <Button
                            type="primary"
                            size="small"
                            icon={<Save className="size-3.5" />}
                            onClick={handleConfirmSave}
                            className="!border-amber-500 !bg-amber-500 font-medium hover:!bg-amber-600"
                        >
                            保存修改并同步
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
