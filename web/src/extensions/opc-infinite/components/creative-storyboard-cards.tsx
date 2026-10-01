// @opc-feature: hypit [start]
import { useState } from "react";
import { App, message as staticMessage, Modal, Input, InputNumber, Select } from "antd";
import { Eye, EyeOff, Magnet, Sparkles, Copy, Layers, Volume2, Edit3 } from "lucide-react";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CreativeReplicationShot, CreativeReplicationShotType } from "../prompts/hypit-director-prompts";

export interface CreativeStoryboardCardsProps {
    shots: CreativeReplicationShot[];
    onUpdateShots: (shots: CreativeReplicationShot[]) => void;
    targetVideoModel: string;
    theme: CanvasTheme;
}

export function CreativeStoryboardCards({
    shots,
    onUpdateShots,
    targetVideoModel: _targetVideoModel,
    theme,
}: CreativeStoryboardCardsProps) {
    const { message: appMessage } = App.useApp();
    const message = appMessage || staticMessage;
    const [previewRawMode, setPreviewRawMode] = useState<"cards" | "raw">("cards");
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editData, setEditData] = useState<CreativeReplicationShot | null>(null);

    const handleStartEdit = (idx: number) => {
        setEditingIndex(idx);
        setEditData(JSON.parse(JSON.stringify(shots[idx])));
    };

    const handleSaveEdit = () => {
        if (editingIndex === null || !editData) return;
        const nextShots = [...shots];
        const dur = Number(editData.durationSec) || 5;
        const start = editData.startSec ?? (editingIndex > 0 ? (nextShots[editingIndex - 1]?.endSec || 0) : 0);
        const end = Math.round((start + dur) * 10) / 10;
        editData.durationSec = dur;
        editData.startSec = start;
        editData.endSec = end;
        editData.timeRange = `${start.toFixed(1)}s - ${end.toFixed(1)}s`;
        nextShots[editingIndex] = editData;
        onUpdateShots(nextShots);
        setEditingIndex(null);
        setEditData(null);
        message.success(`镜 ${editingIndex + 1} 微调已保存`);
    };

    const handleCancelEdit = () => {
        setEditingIndex(null);
        setEditData(null);
    };

    // 统计全案 Ghost Snaps 数量
    const totalGhostSnaps = shots.reduce((acc, s) => acc + (s.ghostSnaps?.length || 0), 0);
    const unadoptedGhostSnaps = shots.reduce((acc, s) => {
        if (!s.brollCoverSlot && s.ghostSnaps && s.ghostSnaps.length > 0) {
            return acc + 1;
        }
        return acc;
    }, 0);

    // 全案一键智能磁吸
    const handleAutoDockAll = () => {
        let dockedCount = 0;
        const updated = shots.map((s) => {
            if (!s.brollCoverSlot && s.ghostSnaps && s.ghostSnaps.length > 0) {
                const bestSnap = s.ghostSnaps[0];
                dockedCount++;
                return {
                    ...s,
                    shotType: "l-cut" as const,
                    brollCoverSlot: {
                        targetWord: bestSnap.targetWord,
                        coverDurationSec: Math.min(2.0, Math.max(1.0, Math.round(s.durationSec * 0.35 * 10) / 10)),
                        assetLabel: bestSnap.suggestedLabel,
                        coverPrompt: `Macro close-up shot focusing on ${bestSnap.suggestedLabel}, photoreal texture, iPhone footage style.`,
                        active: true,
                    },
                };
            }
            return s;
        });

        if (dockedCount === 0) {
            message.info("当前所有镜头切片均已完成吸附挂载");
            return;
        }

        onUpdateShots(updated);
        message.success(`⚡ 全案智能磁吸完成！已自动将 ${dockedCount} 处 B-Roll 特写对号入座挂载`);
    };

    // 单个镜头采纳 Ghost Snap
    const handleAdoptSingleGhostSnap = (shotIndex: number, snap: any) => {
        const targetShot = shots[shotIndex];
        const updatedShot: CreativeReplicationShot = {
            ...targetShot,
            shotType: "l-cut",
            brollCoverSlot: {
                targetWord: snap.targetWord,
                coverDurationSec: Math.min(2.0, Math.max(1.0, Math.round(targetShot.durationSec * 0.35 * 10) / 10)),
                assetLabel: snap.suggestedLabel,
                coverPrompt: `Macro close-up shot focusing on ${snap.suggestedLabel}, crisp lighting, clean background.`,
                active: true,
            },
        };
        const nextShots = [...shots];
        nextShots[shotIndex] = updatedShot;
        onUpdateShots(nextShots);
        message.success(`已为镜头 ${shotIndex + 1} 成功吸附「${snap.suggestedLabel}」覆层切片`);
    };

    // 切换 L-Cut 覆层激活状态 (A/B 盲切对比)
    const handleToggleCoverActive = (shotIndex: number) => {
        const targetShot = shots[shotIndex];
        if (!targetShot.brollCoverSlot) return;

        const currentActive = targetShot.brollCoverSlot.active !== false;
        const updatedShot: CreativeReplicationShot = {
            ...targetShot,
            brollCoverSlot: {
                ...targetShot.brollCoverSlot,
                active: !currentActive,
            },
        };
        const nextShots = [...shots];
        nextShots[shotIndex] = updatedShot;
        onUpdateShots(nextShots);
        message.info(
            !currentActive ? `镜头 ${shotIndex + 1}: 已激活产品切片覆盖` : `镜头 ${shotIndex + 1}: 已切回纯真人正脸 (A/B 对比)`
        );
    };

    // 统计汉字字数与语速容量计算
    const countChineseChars = (text: string) => {
        if (!text) return 0;
        const clean = text.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
        return clean.length;
    };

    return (
        <div className="flex flex-col gap-2 text-[11px]">
            {/* 顶栏控制：视图切换 + 全案一键智能磁吸 */}
            <div className="flex items-center justify-between border-b pb-1 px-0.5" style={{ borderColor: theme.node.stroke }}>
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setPreviewRawMode("cards")}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                            previewRawMode === "cards"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold"
                                : "text-stone-500 hover:text-stone-700"
                        }`}
                    >
                        多态分镜卡片 ({shots.length} 镜)
                    </button>
                    <button
                        type="button"
                        onClick={() => setPreviewRawMode("raw")}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                            previewRawMode === "raw"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold"
                                : "text-stone-500 hover:text-stone-700"
                        }`}
                    >
                        原始 JSON 数据
                    </button>
                </div>

                {previewRawMode === "cards" && unadoptedGhostSnaps > 0 && (
                    <button
                        type="button"
                        onClick={handleAutoDockAll}
                        className="inline-flex items-center gap-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-700 px-2 py-0.5 text-[10px] font-medium cursor-pointer transition-colors shadow-2xs"
                        title="AI 已经为核心卖点词推荐了切片，点击一键自动全部吸附对位！"
                    >
                        <Magnet className="size-2.5" />
                        <span>⚡ 全案一键智能磁吸 ({unadoptedGhostSnaps} 处推荐)</span>
                    </button>
                )}
            </div>

            {/* 卡片视图 */}
            {previewRawMode === "cards" ? (
                <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-0.5 thin-scrollbar">
                    {shots.map((shot, idx) => {
                        const dur = shot.durationSec || 5;
                        const charCount = countChineseChars(shot.lines || shot.voiceLine || "");
                        const maxAllowed = Math.round(dur * 4.2);
                        const isOverLimit = charCount > maxAllowed;

                        const isARoll = shot.shotType === "a-roll";
                        const isBRoll = shot.shotType === "b-roll";
                        const isPov = shot.shotType === "pov";
                        const isLCut = shot.shotType === "l-cut" || Boolean(shot.brollCoverSlot);
                        const isSplit = shot.shotType === "split";

                        const coverActive = shot.brollCoverSlot ? shot.brollCoverSlot.active !== false : false;

                        return (
                            <div
                                key={idx}
                                className="flex flex-col gap-2 rounded-lg border p-2.5 text-[11px] transition-all hover:border-amber-400 shadow-2xs"
                                style={{ background: theme.node.panel, borderColor: theme.node.stroke }}
                            >
                                {/* 镜头顶栏：序号、形态胶囊、时长与运镜 */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-amber-600 dark:text-amber-400">
                                            镜 {shot.shotNumber || idx + 1}
                                        </span>

                                        {/* 多态形态胶囊徽标 */}
                                        <span
                                            className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                                                isLCut
                                                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800"
                                                    : isARoll
                                                      ? "bg-purple-500/15 text-purple-700 dark:text-purple-300"
                                                      : isBRoll
                                                        ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
                                                        : isPov
                                                          ? "bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-300/60 dark:border-teal-800"
                                                          : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                            }`}
                                        >
                                            {isLCut
                                                ? "A+B 覆盖切镜 (L-Cut)"
                                                : isARoll
                                                  ? "纯 A-Roll 口播"
                                                  : isBRoll
                                                    ? "纯 B-Roll 特写"
                                                    : isPov
                                                      ? "第一人称视角 (POV)"
                                                      : "A|B 分屏对比"}
                                        </span>

                                        <span className="font-mono text-[10px] text-neutral-400">
                                            {shot.timeRange || `${dur}s`}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-neutral-400 truncate max-w-[90px]">
                                            {shot.camera || "推近特写"}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleStartEdit(idx)}
                                            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium border border-amber-300 dark:border-amber-700 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 cursor-pointer transition-colors shadow-2xs"
                                            title="微调此镜头台词、时长、运镜与生图/动作 Prompt"
                                        >
                                            <Edit3 className="size-2.5" />
                                            <span>微调</span>
                                        </button>
                                    </div>
                                </div>

                                {/* 台词与人声工程 */}
                                {(shot.lines || shot.voiceLine) && (
                                    <div className="flex flex-col gap-1 rounded bg-black/5 dark:bg-white/5 p-1.5 text-[10px]">
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                                <Volume2 className="size-2.5" />
                                                <span>台词对白</span>
                                                {shot.speaker && <span className="text-neutral-400">[{shot.speaker}]</span>}
                                                {shot.voiceTone && (
                                                    <span className="rounded bg-amber-500/10 px-1 text-[9px] text-amber-600">
                                                        {shot.voiceTone}
                                                    </span>
                                                )}
                                            </span>

                                            {/* 字数容量与语速警示 */}
                                            <span
                                                className={`font-mono text-[9px] px-1 py-0.2 rounded font-medium ${
                                                    isOverLimit
                                                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold"
                                                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                }`}
                                            >
                                                {charCount}字 / {dur}s {isOverLimit ? "⚠️超速" : "✓标准"}
                                            </span>
                                        </div>

                                        <div className="leading-relaxed text-stone-800 dark:text-stone-200">
                                            {shot.lines || shot.voiceLine}
                                        </div>

                                        {/* Dual-Text 发音纠错标示 */}
                                        {shot.spokenLines && shot.spokenLines !== shot.lines && (
                                            <div className="text-[9px] text-amber-700 dark:text-amber-300 font-mono">
                                                🔊 发音纠错 (Dual-Text): {shot.spokenLines}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* L-Cut 覆层切片卡槽 (Cover Slot & 胶片磁力带) */}
                                {shot.brollCoverSlot && (
                                    <div
                                        className={`flex flex-col gap-1 rounded-md border p-1.5 text-[10px] transition-all ${
                                            coverActive
                                                ? "border-amber-400/80 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/30"
                                                : "border-stone-200 dark:border-stone-800 opacity-60 bg-stone-50 dark:bg-stone-900"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold flex items-center gap-1 text-amber-800 dark:text-amber-200">
                                                <Layers className="size-3 text-amber-500" />
                                                <span>
                                                    L-Cut 覆层切片: 「{shot.brollCoverSlot.assetLabel}」
                                                </span>
                                            </span>

                                            <div className="flex items-center gap-1.5">
                                                <span className="font-mono text-[9px] text-amber-700 dark:text-amber-300 bg-amber-500/10 rounded px-1">
                                                    覆于关键词 “{shot.brollCoverSlot.targetWord}” · 持续 {shot.brollCoverSlot.coverDurationSec}s
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleCoverActive(idx)}
                                                    className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium border border-amber-300/80 hover:bg-amber-100 cursor-pointer"
                                                    title={coverActive ? "点击临时关闭切片，A/B 对比纯正脸效果" : "点击重新激活切片覆盖"}
                                                >
                                                    {coverActive ? <Eye className="size-2.5 text-amber-600" /> : <EyeOff className="size-2.5 text-stone-400" />}
                                                    <span>{coverActive ? "覆盖中" : "已隐藏"}</span>
                                                </button>
                                            </div>
                                        </div>

                                        {coverActive && (
                                            <div className="text-[9px] text-stone-500 dark:text-stone-400 line-clamp-1 italic">
                                                💡 主播口播声音不断，在此关键词处画面无缝覆盖此微距特写
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* AI 意图预吸附幽灵卡槽 (Ghost Snaps 建议) */}
                                {!shot.brollCoverSlot && shot.ghostSnaps && shot.ghostSnaps.length > 0 && (
                                    <div className="flex items-center justify-between rounded border border-dashed border-amber-300 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/20 px-2 py-1">
                                        <div className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300">
                                            <Sparkles className="size-2.5 text-amber-500" />
                                            <span>
                                                AI 推荐磁吸: <strong>{shot.ghostSnaps[0].suggestedLabel}</strong> (针对关键词 “{shot.ghostSnaps[0].targetWord}”，匹配度 {shot.ghostSnaps[0].matchScore}%)
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleAdoptSingleGhostSnap(idx, shot.ghostSnaps![0])}
                                            className="rounded bg-amber-500 text-white px-1.5 py-0.2 text-[9px] font-medium hover:bg-amber-600 cursor-pointer active:scale-95"
                                        >
                                            一键吸附
                                        </button>
                                    </div>
                                )}

                                {/* iPhone UGC 首帧生图 Prompt */}
                                {shot.imagePrompt && (
                                    <div className="rounded bg-black/5 dark:bg-white/5 p-1.5 text-[9px] text-stone-600 dark:text-stone-300 font-mono">
                                        <div className="flex items-center justify-between mb-0.5 text-[8px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-sans font-semibold">
                                            <span>iPhone UGC 首帧生图 Prompt</span>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigator.clipboard.writeText(shot.imagePrompt);
                                                    message.success("已复制首帧生图 Prompt");
                                                }}
                                                className="hover:underline cursor-pointer flex items-center gap-0.5"
                                            >
                                                <Copy className="size-2" />
                                                <span>复制</span>
                                            </button>
                                        </div>
                                        <div className="line-clamp-2 leading-relaxed">{shot.imagePrompt}</div>
                                    </div>
                                )}

                                {/* 微动作 & 运镜 Prompt */}
                                {shot.motionPrompt && (
                                    <div className="rounded bg-black/5 dark:bg-white/5 p-1.5 text-[9px] text-stone-600 dark:text-stone-300 font-mono">
                                        <div className="flex items-center justify-between mb-0.5 text-[8px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-sans font-semibold">
                                            <span>微动作 & 运镜 Prompt (词级触发 + 防乱码)</span>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigator.clipboard.writeText(shot.motionPrompt);
                                                    message.success("已复制微动作 Prompt");
                                                }}
                                                className="hover:underline cursor-pointer flex items-center gap-0.5"
                                            >
                                                <Copy className="size-2" />
                                                <span>复制</span>
                                            </button>
                                        </div>
                                        <div className="line-clamp-2 leading-relaxed">{shot.motionPrompt}</div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="rounded bg-black/5 dark:bg-white/5 p-2 font-mono text-[9px] text-stone-700 dark:text-stone-300 max-h-60 overflow-y-auto thin-scrollbar">
                    <pre className="whitespace-pre-wrap">{JSON.stringify(shots, null, 2)}</pre>
                </div>
            )}

            {/* 镜头微调模态框 */}
            <Modal
                title={`微调分镜头 #${editingIndex !== null ? (shots[editingIndex]?.shotNumber || editingIndex + 1) : ""}`}
                open={editingIndex !== null}
                onOk={handleSaveEdit}
                onCancel={handleCancelEdit}
                okText="保存修改"
                cancelText="取消"
                width={560}
                destroyOnClose
            >
                {editData && (
                    <div className="flex flex-col gap-3 py-2 text-xs">
                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <label className="block text-[11px] font-medium text-stone-600 dark:text-stone-300 mb-1">
                                    镜头类型
                                </label>
                                <Select
                                    size="small"
                                    className="w-full"
                                    value={editData.shotType}
                                    onChange={(val: CreativeReplicationShotType) =>
                                        setEditData({ ...editData, shotType: val })
                                    }
                                    options={[
                                        { value: "a-roll", label: "纯 A-Roll 口播" },
                                        { value: "b-roll", label: "纯 B-Roll 特写" },
                                        { value: "pov", label: "第一人称视角 (POV)" },
                                        { value: "l-cut", label: "A+B 覆盖切镜 (L-Cut)" },
                                        { value: "split", label: "A|B 分屏对比" },
                                    ]}
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-medium text-stone-600 dark:text-stone-300 mb-1">
                                    镜头时长 (秒)
                                </label>
                                <InputNumber
                                    size="small"
                                    className="w-full"
                                    min={1}
                                    max={60}
                                    step={0.5}
                                    value={editData.durationSec}
                                    onChange={(val) =>
                                        setEditData({ ...editData, durationSec: val || 5 })
                                    }
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-medium text-stone-600 dark:text-stone-300 mb-1">
                                    运镜调度
                                </label>
                                <Input
                                    size="small"
                                    value={editData.camera || ""}
                                    placeholder="如：推近特写 / 环绕运镜"
                                    onChange={(e) =>
                                        setEditData({ ...editData, camera: e.target.value })
                                    }
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-[11px] font-medium text-stone-600 dark:text-stone-300">
                                    台词对白 (口播内容)
                                </label>
                                <span className="text-[10px] text-stone-400">
                                    {countChineseChars(editData.lines || "")} 字 /{" "}
                                    {editData.durationSec || 5}s (推荐约{" "}
                                    {Math.round((editData.durationSec || 5) * 4.2)} 字)
                                </span>
                            </div>
                            <Input.TextArea
                                rows={2}
                                value={editData.lines || ""}
                                placeholder="输入该镜头台词内容..."
                                onChange={(e) =>
                                    setEditData({ ...editData, lines: e.target.value })
                                }
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-medium text-stone-600 dark:text-stone-300 mb-1">
                                发音纠错 (Dual-Text 读音/数字/专有名词注音)
                            </label>
                            <Input
                                size="small"
                                value={editData.spokenLines || ""}
                                placeholder="如：3C 读作「三 C」、100% 读作「百分之百」，为空默认同台词"
                                onChange={(e) =>
                                    setEditData({ ...editData, spokenLines: e.target.value })
                                }
                            />
                        </div>

                        {/* L-Cut 覆层切片设置 */}
                        {(editData.shotType === "l-cut" || editData.brollCoverSlot) && (
                            <div className="p-2.5 rounded-lg border border-amber-300/80 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 flex flex-col gap-2">
                                <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 flex items-center justify-between">
                                    <span className="flex items-center gap-1">
                                        <Layers className="size-3 text-amber-500" />
                                        <span>L-Cut 覆层切片设置 (商品/细节特写覆盖)</span>
                                    </span>
                                    {editData.brollCoverSlot && (
                                        <label className="text-[10px] font-normal cursor-pointer flex items-center gap-1">
                                            <input
                                                type="checkbox"
                                                checked={editData.brollCoverSlot.active !== false}
                                                onChange={(e) =>
                                                    setEditData({
                                                        ...editData,
                                                        brollCoverSlot: {
                                                            ...editData.brollCoverSlot!,
                                                            active: e.target.checked,
                                                        },
                                                    })
                                                }
                                            />
                                            <span>启用此覆层</span>
                                        </label>
                                    )}
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="block text-[10px] text-stone-500 mb-0.5">
                                            覆于关键词
                                        </label>
                                        <Input
                                            size="small"
                                            value={editData.brollCoverSlot?.targetWord || ""}
                                            placeholder="如：核心成分"
                                            onChange={(e) =>
                                                setEditData({
                                                    ...editData,
                                                    brollCoverSlot: {
                                                        targetWord: e.target.value,
                                                        assetLabel: editData.brollCoverSlot?.assetLabel || "产品特写",
                                                        coverDurationSec: editData.brollCoverSlot?.coverDurationSec || 2.0,
                                                        coverPrompt: editData.brollCoverSlot?.coverPrompt || "",
                                                        active: editData.brollCoverSlot?.active !== false,
                                                    },
                                                })
                                            }
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-stone-500 mb-0.5">
                                            切片标签
                                        </label>
                                        <Input
                                            size="small"
                                            value={editData.brollCoverSlot?.assetLabel || ""}
                                            placeholder="如：商品微距"
                                            onChange={(e) =>
                                                setEditData({
                                                    ...editData,
                                                    brollCoverSlot: {
                                                        targetWord: editData.brollCoverSlot?.targetWord || "",
                                                        assetLabel: e.target.value,
                                                        coverDurationSec: editData.brollCoverSlot?.coverDurationSec || 2.0,
                                                        coverPrompt: editData.brollCoverSlot?.coverPrompt || "",
                                                        active: editData.brollCoverSlot?.active !== false,
                                                    },
                                                })
                                            }
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-stone-500 mb-0.5">
                                            覆层时长 (秒)
                                        </label>
                                        <InputNumber
                                            size="small"
                                            className="w-full"
                                            min={0.5}
                                            max={10}
                                            step={0.5}
                                            value={editData.brollCoverSlot?.coverDurationSec || 2.0}
                                            onChange={(val) =>
                                                setEditData({
                                                    ...editData,
                                                    brollCoverSlot: {
                                                        targetWord: editData.brollCoverSlot?.targetWord || "",
                                                        assetLabel: editData.brollCoverSlot?.assetLabel || "产品特写",
                                                        coverDurationSec: val || 2.0,
                                                        coverPrompt: editData.brollCoverSlot?.coverPrompt || "",
                                                        active: editData.brollCoverSlot?.active !== false,
                                                    },
                                                })
                                            }
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] text-stone-500 mb-0.5">
                                        覆层切片生图/动作 Prompt
                                    </label>
                                    <Input
                                        size="small"
                                        value={editData.brollCoverSlot?.coverPrompt || ""}
                                        placeholder="Macro close-up shot focusing on..."
                                        onChange={(e) =>
                                            setEditData({
                                                ...editData,
                                                brollCoverSlot: {
                                                    targetWord: editData.brollCoverSlot?.targetWord || "",
                                                    assetLabel: editData.brollCoverSlot?.assetLabel || "产品特写",
                                                    coverDurationSec: editData.brollCoverSlot?.coverDurationSec || 2.0,
                                                    coverPrompt: e.target.value,
                                                    active: editData.brollCoverSlot?.active !== false,
                                                },
                                            })
                                        }
                                    />
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-[11px] font-medium text-stone-600 dark:text-stone-300 mb-1">
                                iPhone UGC 首帧生图 Prompt (Image Prompt)
                            </label>
                            <Input.TextArea
                                rows={2}
                                value={editData.imagePrompt || ""}
                                placeholder="iPhone 15 Pro Max 4k video recording style..."
                                onChange={(e) =>
                                    setEditData({ ...editData, imagePrompt: e.target.value })
                                }
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-medium text-stone-600 dark:text-stone-300 mb-1">
                                微动作 & 运镜 Prompt (Motion Prompt)
                            </label>
                            <Input.TextArea
                                rows={2}
                                value={editData.motionPrompt || ""}
                                placeholder="Smooth handheld motion, natural eye-blinking..."
                                onChange={(e) =>
                                    setEditData({ ...editData, motionPrompt: e.target.value })
                                }
                            />
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
// @opc-feature: hypit [end]
