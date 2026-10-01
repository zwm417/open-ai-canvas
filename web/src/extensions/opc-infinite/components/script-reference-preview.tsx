import { useState, useMemo } from "react";
import { Image as AntImage } from "antd";
import { Video, FileAudio, FileImage, Sparkles, AtSign, X } from "lucide-react";
import { CanvasResourceMentionTextarea } from "@/components/canvas/canvas-resource-mention-textarea";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";

export type ScriptSourceMedia = {
    id: string;
    name: string;
    kind: "image" | "video" | "audio";
    url?: string;
    dataUrl?: string;
};

type ScriptReferencePreviewProps = {
    script: string;
    sourceMediaList?: ScriptSourceMedia[];
    references?: CanvasResourceReference[];
    onChange?: (newScript: string) => void;
    onDisconnectReference?: (reference: CanvasResourceReference) => void;
    editable?: boolean;
    className?: string;
};

export function ScriptReferencePreview({
    script,
    sourceMediaList = [],
    references: externalReferences,
    onChange,
    onDisconnectReference,
    editable = true,
    className = "",
}: ScriptReferencePreviewProps) {
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [failedImageIds, setFailedImageIds] = useState<Set<string>>(() => new Set());

    // 优先直接使用外部已解析且保持活跃生命周期的 CanvasResourceReference[]，若无则回退转换
    const mentionReferences: CanvasResourceReference[] = useMemo(() => {
        if (externalReferences && externalReferences.length > 0) {
            return externalReferences;
        }

        let imageOrder = 0;
        let videoOrder = 0;
        let audioOrder = 0;

        return sourceMediaList.map((media) => {
            let label = "";
            if (media.kind === "image") {
                imageOrder += 1;
                label = `图片${imageOrder}`;
            } else if (media.kind === "video") {
                videoOrder += 1;
                label = `视频${videoOrder}`;
            } else if (media.kind === "audio") {
                audioOrder += 1;
                label = `音频${audioOrder}`;
            } else {
                label = media.name || "素材";
            }

            const isImage = media.kind === "image";
            const previewUrl = isImage ? (media.dataUrl || media.url) : undefined;
            const mediaUrl = media.kind === "video" ? (media.url || media.dataUrl) : undefined;

            return {
                id: media.id,
                nodeId: media.id,
                kind: media.kind,
                label,
                title: media.name || label,
                previewUrl,
                mediaUrl,
                active: true,
                mentionToken: `@${label}`,
            };
        });
    }, [externalReferences, sourceMediaList]);

    // 点击上方素材芯片，直接向脚本当前末尾追加 @素材 标记
    const handleInsertReference = (ref: CanvasResourceReference) => {
        if (!editable) return;
        const token = `@${ref.label} `;
        const current = script || "";
        onChange?.(current ? `${current} ${token}` : token);
    };

    return (
        <div
            className={`flex flex-col gap-3 ${className}`}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {/* 顶部已连接素材 Shelf：支持一键点击插入 @素材 与缩略图预览 */}
            {mentionReferences.length > 0 ? (
                <div className="flex flex-col gap-1.5 rounded-lg border border-amber-200/60 bg-amber-50/40 p-2.5 dark:border-amber-900/40 dark:bg-amber-950/20">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                            <Sparkles className="size-3.5 text-amber-500" />
                            <span>已连接创作素材 ({mentionReferences.length})</span>
                            <span className="text-[11px] font-normal text-stone-500 dark:text-stone-400">
                                · 点击下方素材标签可一键插入脚本引用
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        {mentionReferences.map((ref) => {
                            const isImgFailed = failedImageIds.has(ref.id);
                            const isImg = ref.kind === "image" && Boolean(ref.previewUrl) && !isImgFailed;
                            return (
                                <span
                                    key={ref.id}
                                    className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/80 bg-white px-2 py-1 text-xs font-medium text-amber-900 shadow-2xs transition-all hover:scale-102 hover:border-amber-400 hover:bg-amber-50/60 select-none dark:border-amber-700/80 dark:bg-stone-900 dark:text-amber-200 dark:hover:bg-amber-950/50"
                                >
                                    {/* 缩略图 / 图标 */}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (isImg && ref.previewUrl) setPreviewImage(ref.previewUrl);
                                            else handleInsertReference(ref);
                                        }}
                                        className="flex items-center justify-center cursor-pointer"
                                        title={isImg ? "点击预览大图" : `插入 @${ref.label}`}
                                    >
                                        {isImg ? (
                                            <img
                                                src={ref.previewUrl}
                                                alt={ref.label}
                                                className="size-5 rounded object-cover border border-amber-200/60 dark:border-amber-700/60"
                                                onError={() => {
                                                    setFailedImageIds((prev) => new Set(prev).add(ref.id));
                                                }}
                                            />
                                        ) : ref.kind === "video" && ref.mediaUrl ? (
                                            <video
                                                src={ref.mediaUrl}
                                                className="size-5 rounded object-cover border border-purple-200/60 dark:border-purple-700/60"
                                                muted
                                                playsInline
                                                preload="metadata"
                                                onLoadedMetadata={(e) => {
                                                    try {
                                                        e.currentTarget.currentTime = 0.001;
                                                    } catch {}
                                                }}
                                            />
                                        ) : ref.kind === "video" ? (
                                            <Video className="size-4 text-purple-600 dark:text-purple-400" />
                                        ) : ref.kind === "audio" ? (
                                            <FileAudio className="size-4 text-emerald-600 dark:text-emerald-400" />
                                        ) : (
                                            <FileImage className="size-4 text-amber-600 dark:text-amber-400" />
                                        )}
                                    </button>

                                    {/* 插入按钮 */}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleInsertReference(ref);
                                        }}
                                        className="flex items-center gap-0.5 font-semibold text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100 cursor-pointer"
                                        title={`插入 @${ref.label} 到提示词`}
                                    >
                                        <AtSign className="size-3" />
                                        <span>{ref.label}</span>
                                    </button>

                                    {/* 断开连线按钮 */}
                                    {onDisconnectReference && ref.nodeId ? (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDisconnectReference(ref);
                                            }}
                                            className="ml-0.5 rounded p-0.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors cursor-pointer"
                                            title={`断开与 ${ref.label} (${ref.title}) 的画布连线`}
                                        >
                                            <X className="size-3" />
                                        </button>
                                    ) : null}
                                </span>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            {/* 一体化可编辑脚本区域：支持自由编辑、输入 @ 联想与 @缩略图 实时渲染 */}
            <div
                className="flex flex-col h-[56vh] min-h-[440px] max-h-[72vh] rounded-lg border border-stone-200 bg-white p-3.5 shadow-2xs dark:border-stone-800 dark:bg-stone-900/50"
                data-canvas-no-zoom
            >
                <CanvasResourceMentionTextarea
                    value={script}
                    references={mentionReferences}
                    includeAssetLibrary
                    onChange={(newVal) => onChange?.(newVal)}
                    sendOnEnter={false}
                    highlightLabels={true}
                    rows={16}
                    containerClassName="h-full flex-1 flex flex-col min-h-0"
                    className="thin-scrollbar flex-1 h-full min-h-[380px] w-full resize-none overflow-y-auto border-none bg-transparent p-1 font-sans text-[15px] leading-[1.8] text-stone-800 dark:text-stone-100 !outline-none !ring-0 !shadow-none focus:!outline-none focus:!ring-0 focus:!shadow-none placeholder:text-stone-400"
                    style={{ minHeight: "380px", height: "100%" }}
                    placeholder="在此直接编辑视频提示词内容，支持直接键盘修改、打字输入；输入 @ 符号可随时弹出素材联想菜单快速引用素材..."
                />
            </div>

            {/* 底部提示与统计条 */}
            <div className="flex items-center justify-between text-xs text-stone-400 dark:text-stone-500 pt-0.5">
                <span className="flex items-center gap-1.5">
                    <span>💡 提示：在文本框内输入 <span className="font-semibold text-amber-600 dark:text-amber-400">@</span> 可快速联想并插入素材，所有修改将实时同步至画布。</span>
                </span>
                <span>总字数：{(script || "").length} 字</span>
            </div>

            {/* 大图预览弹窗 */}
            {previewImage ? (
                <AntImage
                    preview={{
                        visible: Boolean(previewImage),
                        src: previewImage,
                        onVisibleChange: (v) => {
                            if (!v) setPreviewImage(null);
                        },
                    }}
                    src={previewImage}
                    style={{ display: "none" }}
                />
            ) : null}
        </div>
    );
}
