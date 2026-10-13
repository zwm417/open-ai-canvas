// @opc-feature: detail_set_workflow [start]
// 电商套图工作流卡片三件套：创作卡（模块选择/风格/补充说明/规划态/确认态）+ 手机沉浸预览。
// 视觉规范：stone 中性色 + amber 唯一强调色；手机屏为设备模拟（恒定浅色，贴近真实电商 App）。
// 商业正向设计：左侧配置与规划评审为单一数据录入源，右侧纯净沉浸式手机预览，杜绝横向挤压与重复按钮。

import { useEffect, useMemo, useRef, useState } from "react";
import { message } from "antd";
import { CheckSquare, ClipboardPaste, FolderPlus, LoaderCircle, Plus, Sparkles, Trash2 } from "lucide-react";

import {
    DETAIL_SET_CATEGORIES,
    DETAIL_SET_LANGUAGE_LABEL,
    DETAIL_SET_MODULE_THUMBNAILS,
    DETAIL_SET_LANGUAGE_OPTIONS,
    DETAIL_SET_MODULE_MAX_COUNT,
    DETAIL_SET_MODULES,
    DETAIL_SET_STYLE_PRESETS,
    DETAIL_SET_TOTAL_MAX_COUNT,
    detailSetModuleShort,
    detailSetTotalCount,
    type DetailSetCategory,
    type DetailSetPlanSnapshot,
    type DetailSetRow,
} from "../types/detail-set";
import { checkDetailSetAdCompliance } from "../core/detail-set-compliance";
import {
    extractCopyFromPromptText,
    updatePromptTypography,
} from "../core/detail-set-planner";
import {
    useDetailSetCanRedo,
    useDetailSetCanUndo,
    useDetailSetStore,
} from "../stores/use-detail-set-store";

/* ================= 创作卡（中栏 / 左侧配置） ================= */

export function DetailSetWorkflowCard({ submitting }: { submitting?: boolean }) {
    const draft = useDetailSetStore((state) => state.draft);
    const setDraft = useDetailSetStore((state) => state.setDraft);
    const phase = useDetailSetStore((state) => state.phase);
    const planningStage = useDetailSetStore((state) => state.planningStage);
    const planError = useDetailSetStore((state) => state.planError);
    const setPlanError = useDetailSetStore((state) => state.setPlanError);
    const plan = useDetailSetStore((state) => state.plan);
    const totalCount = detailSetTotalCount(draft.selections);
    const extraViolations = useMemo(() => checkDetailSetAdCompliance(draft.extraInstruction), [draft.extraInstruction]);

    if (phase === "planning") {
        return <PlanningView stage={planningStage} />;
    }
    if (phase === "review" && plan) {
        return (
            <PlanReviewView plan={plan} />
        );
    }
    return (
        <div className="flex flex-col gap-4">
            {/* 商品信息与品类预设 */}
            <section className="rounded-xl border border-black/[0.08] bg-stone-50/60 p-3 dark:border-white/[0.08] dark:bg-[#1f1f22]">
                <div className="mb-2.5 flex items-center justify-between">
                    <h3 className="text-[14px] font-semibold text-stone-900 dark:text-stone-100">商品识别与品类</h3>
                    <span className="text-[11px] text-stone-400">结合上传素材精准对齐管线</span>
                </div>
                
                {/* 商品名称 */}
                <div className="mb-2.5">
                    <label className="mb-1 block text-xs font-medium text-stone-700 dark:text-stone-300">
                        商品名称 <span className="text-[11px] font-normal text-stone-400">(上传图自动提取，可微调)</span>
                    </label>
                    <input
                        type="text"
                        value={draft.productName ?? ""}
                        onChange={(e) => {
                            const val = e.target.value;
                            setDraft({ productName: val, productNameSource: val.trim() ? "manual" : "auto" });
                        }}
                        placeholder="例：316不锈钢保温杯、重磅纯棉宽松短袖T恤、无线降噪耳机"
                        className="w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-xs text-stone-900 outline-none placeholder:text-stone-400 focus:border-amber-500/60 dark:border-white/[0.1] dark:bg-[#1c1c1e] dark:text-stone-100 dark:placeholder:text-stone-500"
                    />
                </div>

                {/* 品类预设切换 Pills */}
                <div className="mb-2.5">
                    <label className="mb-1.5 block text-xs font-medium text-stone-700 dark:text-stone-300">
                        品类管线 <span className="text-[11px] font-normal text-stone-400">专属光学构图与分镜叙事配方</span>
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                        {DETAIL_SET_CATEGORIES.map((cat) => {
                            const selected = (draft.category ?? "auto") === cat.id;
                            return (
                                <button
                                    key={cat.id}
                                    type="button"
                                    title={cat.desc}
                                    onClick={() => setDraft({ category: cat.id })}
                                    className={`flex h-7 items-center justify-center rounded-lg border px-1.5 text-[11px] font-medium transition-all ${
                                        selected
                                            ? "border-amber-500 bg-amber-50 text-amber-900 ring-1 ring-amber-500/20 dark:bg-amber-950/40 dark:text-amber-200"
                                            : "border-black/[0.08] bg-white text-stone-600 hover:border-black/[0.16] hover:text-stone-900 dark:border-white/[0.1] dark:bg-[#1c1c1e] dark:text-stone-400 dark:hover:text-stone-200"
                                    }`}
                                >
                                    {cat.name}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 核心卖点 */}
                <div>
                    <label className="mb-1 block text-xs font-medium text-stone-700 dark:text-stone-300">
                        核心卖点与材质 <span className="text-[11px] font-normal text-stone-400">(可选，重点突出)</span>
                    </label>
                    <input
                        type="text"
                        value={draft.keySellingPoints ?? ""}
                        onChange={(e) => setDraft({ keySellingPoints: e.target.value })}
                        placeholder="例：双层真空锁温、重磅260g透气全棉、主动降噪高解析音质"
                        className="w-full rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-xs text-stone-900 outline-none placeholder:text-stone-400 focus:border-amber-500/60 dark:border-white/[0.1] dark:bg-[#1c1c1e] dark:text-stone-100 dark:placeholder:text-stone-500"
                    />
                </div>
            </section>

            {/* 模块选择 */}
            <section>
                <div className="mb-2.5 flex items-center justify-between">
                    <h3 className="text-[15px] font-semibold">选择模块</h3>
                    <span className="text-xs text-stone-500 dark:text-stone-400">
                        已选 <span className="font-medium text-stone-900 dark:text-stone-100">{Object.values(draft.selections).filter((count) => count > 0).length}</span> 类，共{" "}
                        <span className="font-medium text-stone-900 dark:text-stone-100">{totalCount} / {DETAIL_SET_TOTAL_MAX_COUNT}</span> 张
                    </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                    {DETAIL_SET_MODULES.map((mod) => (
                        <ModuleCard
                            key={mod.purpose}
                            purpose={mod.purpose}
                            short={mod.short}
                            desc={mod.desc}
                            count={draft.selections[mod.purpose] ?? 0}
                            totalCount={totalCount}
                            onChange={(count) => setDraft({ selections: { ...draft.selections, [mod.purpose]: count } })}
                        />
                    ))}
                </div>
                {totalCount >= DETAIL_SET_TOTAL_MAX_COUNT && (
                    <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">已达单批上限 {DETAIL_SET_TOTAL_MAX_COUNT} 张</p>
                )}
            </section>

            {/* 商品一致性 */}
            <div className="flex h-11 items-center justify-between rounded-xl border border-black/[0.06] bg-stone-50/70 px-2.5 dark:border-white/[0.08] dark:bg-[#2c2c2e]">
                <p className="min-w-0 truncate text-xs font-medium text-stone-800 dark:text-stone-200">
                    商品一致性
                    <span className="ml-2 text-[10px] font-normal text-stone-400 dark:text-stone-500">外观/包装/logo 保持不变</span>
                </p>
                <Switch checked={draft.productSafe} onChange={(productSafe) => setDraft({ productSafe })} />
            </div>

            {/* 套图风格 */}
            <section>
                <h3 className="mb-2 text-[15px] font-semibold">套图风格</h3>
                <div className="grid grid-cols-4 gap-1.5">
                    {DETAIL_SET_STYLE_PRESETS.map((preset) => {
                        const selected = draft.stylePresetId === preset.id;
                        return (
                            <button
                                key={preset.id}
                                type="button"
                                title={preset.look}
                                onClick={() => setDraft({ stylePresetId: selected ? null : preset.id })}
                                className={`flex h-8 min-w-0 items-center justify-center gap-1 rounded-lg border px-1.5 text-xs transition-all ${
                                    selected
                                        ? "border-amber-500 bg-amber-50 font-medium text-stone-900 ring-1 ring-amber-500/20 dark:bg-amber-950/30 dark:text-stone-100"
                                        : "border-black/[0.08] bg-white text-stone-600 hover:border-black/[0.16] hover:text-stone-900 dark:border-white/[0.1] dark:bg-[#1c1c1e] dark:text-stone-400 dark:hover:text-stone-200"
                                }`}
                            >
                                <span className="shrink-0 text-[11px] leading-none">{preset.emoji}</span>
                                <span className="truncate">{preset.name}</span>
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* 补充说明 */}
            <section>
                <div className="rounded-xl border border-black/[0.08] bg-white p-3 dark:border-white/[0.08] dark:bg-[#1c1c1e]">
                    <textarea
                        value={draft.extraInstruction ?? ""}
                        onChange={(event) => setDraft({ extraInstruction: event.target.value })}
                        placeholder="补充说明(可选)：卖点方向、目标人群、禁用元素、希望呈现的风格"
                        rows={3}
                        className="scrollbar-hidden block w-full resize-none bg-transparent text-[13px] text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-100 dark:placeholder:text-stone-500"
                    />
                </div>
                {extraViolations.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-800/60 dark:bg-amber-950/30">
                        <span className="text-[11px] text-amber-700 dark:text-amber-300">广告法风险词：</span>
                        {extraViolations.map((violation) => (
                            <span key={violation.term} title={violation.suggestion} className="cursor-help rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                                {violation.term}
                            </span>
                        ))}
                    </div>
                )}
            </section>

            {planError && (
                <div className="rounded-xl border border-red-200 bg-red-50/70 px-3 py-2 dark:border-red-800/60 dark:bg-red-950/30">
                    <p className="text-[11px] leading-5 text-red-600 dark:text-red-400">规划失败：{planError}</p>
                    <button type="button" onClick={() => setPlanError(undefined)} className="mt-1 text-[11px] text-stone-400 underline-offset-2 hover:underline">
                        知道了
                    </button>
                </div>
            )}
        </div>
    );
}

function PlanningView({ stage }: { stage: number }) {
    const stages = ["分析商品图卖点", "规划模块叙事结构", "撰写每行提示词"];
    return (
        <div className="flex flex-1 min-h-[380px] h-full flex-col items-center justify-center gap-5 px-8 py-12">
            <div className="relative h-1.5 w-56 overflow-hidden rounded-full bg-stone-100 dark:bg-[#2c2c2e]">
                <div className="detail-set-plan-progress-bar absolute h-full w-1/4 rounded-full bg-amber-500" />
            </div>
            <div className="flex flex-col items-center gap-2">
                {stages.map((label, index) => (
                    <div key={label} className="flex items-center gap-2.5 text-[13px]">
                        <span
                            className={`flex size-4.5 items-center justify-center rounded-full text-[10px] font-medium transition-colors ${
                                index < stage
                                    ? "bg-amber-500 text-white"
                                    : index === stage
                                    ? "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 ring-1 ring-amber-500/30"
                                    : "bg-stone-200 text-stone-400 dark:bg-stone-700"
                            }`}
                        >
                            {index < stage ? "✓" : index === stage ? <LoaderCircle className="size-3 animate-spin" /> : index + 1}
                        </span>
                        <span
                            className={`transition-colors ${
                                index === stage
                                    ? "font-medium text-stone-900 dark:text-stone-100"
                                    : index < stage
                                    ? "text-stone-500 dark:text-stone-400"
                                    : "text-stone-400 dark:text-stone-500"
                            }`}
                        >
                            {label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PlanReviewView({ plan }: { plan: DetailSetPlanSnapshot }) {
    const updatePlanRow = useDetailSetStore((state) => state.updatePlanRow);
    const movePlanRow = useDetailSetStore((state) => state.movePlanRow);
    const deletePlanRow = useDetailSetStore((state) => state.deletePlanRow);
    const undoPlanRows = useDetailSetStore((state) => state.undoPlanRows);
    const redoPlanRows = useDetailSetStore((state) => state.redoPlanRows);
    const updatePlanMeta = useDetailSetStore((state) => state.updatePlanMeta);
    const canUndo = useDetailSetCanUndo();
    const canRedo = useDetailSetCanRedo();
    const [expandedSeq, setExpandedSeq] = useState<number | null>(null);
    const [draftPrompt, setDraftPrompt] = useState("");
    const violations = useMemo(() => checkDetailSetAdCompliance(plan.rows.map((row) => `${row.title ?? ""}${row.copy ?? ""}`).join("")), [plan.rows]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                if (expandedSeq !== null) {
                    event.preventDefault();
                    event.stopPropagation();
                    setExpandedSeq(null);
                    return;
                }
            }
            if (!(event.ctrlKey || event.metaKey)) return;
            const target = event.target as HTMLElement | null;
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
            const key = event.key.toLowerCase();
            if (key === "z" && !event.shiftKey) {
                event.preventDefault();
                undoPlanRows(plan.planId);
            } else if (key === "y" || (key === "z" && event.shiftKey)) {
                event.preventDefault();
                redoPlanRows(plan.planId);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [plan.planId, undoPlanRows, redoPlanRows, expandedSeq]);

    return (
        <div className="flex flex-col gap-3">
            {/* 商品信息快速编辑卡片 */}
            <div className="rounded-xl border border-black/[0.06] bg-stone-50/70 p-3 dark:border-white/[0.08] dark:bg-[#232326]">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-2.5">
                    <label className="flex items-center gap-2">
                        <span className="shrink-0 text-xs font-medium text-stone-500 dark:text-stone-400">商品名称</span>
                        <input
                            value={plan.productName ?? ""}
                            onChange={(e) => updatePlanMeta(plan.planId, { productName: e.target.value })}
                            className="min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-xs text-stone-900 outline-none focus:border-amber-500/60 dark:border-white/[0.1] dark:bg-[#1c1c1e] dark:text-stone-100"
                            placeholder="输入商品名称"
                        />
                    </label>
                    <label className="flex items-center gap-2">
                        <span className="shrink-0 text-xs font-medium text-stone-500 dark:text-stone-400">标价</span>
                        <div className="relative flex-1">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-stone-400">¥</span>
                            <input
                                value={plan.price ?? ""}
                                onChange={(e) => updatePlanMeta(plan.planId, { price: e.target.value })}
                                className="w-full rounded-lg border border-black/[0.08] bg-white pl-5 pr-2 py-1 text-xs font-mono text-stone-900 outline-none focus:border-amber-500/60 dark:border-white/[0.1] dark:bg-[#1c1c1e] dark:text-stone-100"
                                placeholder="99.00"
                            />
                        </div>
                    </label>
                </div>
            </div>

            {/* 状态栏：元数据标签 + 撤销重做 + 返回调整 */}
            <div className="flex flex-wrap items-center gap-1.5">
                {plan.stylePresetId && (
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600 dark:bg-[#2c2c2e] dark:text-stone-300">
                        {DETAIL_SET_STYLE_PRESETS.find((preset) => preset.id === plan.stylePresetId)?.name}
                    </span>
                )}
                {plan.config.productSafe && (
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600 dark:bg-[#2c2c2e] dark:text-stone-300">
                        商品一致性
                    </span>
                )}
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600 dark:bg-[#2c2c2e] dark:text-stone-300">
                    {plan.config.addText ? `文案 · ${DETAIL_SET_LANGUAGE_LABEL[plan.config.outputLanguage] ?? plan.config.outputLanguage}` : "无文案"}
                </span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600 dark:bg-[#2c2c2e] dark:text-stone-300">
                    {plan.config.aspectRatio} · {plan.config.resolution}
                </span>

                <div className="ml-auto flex items-center gap-1">
                    <button
                        type="button"
                        disabled={!canUndo}
                        onClick={() => undoPlanRows(plan.planId)}
                        title="撤销 Ctrl+Z"
                        className="rounded-md px-1.5 py-0.5 text-[11px] text-stone-500 transition-colors hover:bg-stone-100 disabled:opacity-30 dark:hover:bg-[#2c2c2e]"
                    >
                        ↩ 撤销
                    </button>
                    <button
                        type="button"
                        disabled={!canRedo}
                        onClick={() => redoPlanRows(plan.planId)}
                        title="重做 Ctrl+Y"
                        className="rounded-md px-1.5 py-0.5 text-[11px] text-stone-500 transition-colors hover:bg-stone-100 disabled:opacity-30 dark:hover:bg-[#2c2c2e]"
                    >
                        ↪ 重做
                    </button>
                    <button
                        type="button"
                        onClick={() => useDetailSetStore.getState().setPhase("create")}
                        className="rounded-md px-2 py-0.5 text-[11px] font-medium text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30 transition-colors"
                    >
                        重新选模块
                    </button>
                </div>
            </div>

            {/* 商品分析 */}
            {plan.analysis && (plan.analysis.sellingPoints?.length || plan.analysis.targetAudience) ? (
                <div className="rounded-xl border border-black/[0.06] bg-stone-50/70 px-3 py-2 text-[11px] leading-5 text-stone-500 dark:border-white/[0.08] dark:bg-[#232326] dark:text-stone-400">
                    <span className="font-medium text-stone-700 dark:text-stone-200">卖点提炼：</span>
                    {(plan.analysis.sellingPoints ?? []).join("；")}
                    {plan.analysis.targetAudience ? ` · 目标人群：${plan.analysis.targetAudience}` : ""}
                </div>
            ) : null}

            {/* 广告法风险词提示 */}
            {violations.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-800/60 dark:bg-amber-950/30">
                    <span className="text-[11px] text-amber-700 dark:text-amber-300">图内文案含 {violations.length} 个风险词（仅提示）：</span>
                    {violations.map((violation) => (
                        <span key={violation.term} title={violation.suggestion} className="cursor-help rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                            {violation.term}
                        </span>
                    ))}
                </div>
            )}

            {/* 分镜行列表 */}
            <div className="flex flex-col gap-2">
                {plan.rows.map((row, index) => (
                    <div key={row.seq} className="rounded-xl border border-black/[0.07] bg-white p-3 shadow-2xs dark:border-white/[0.08] dark:bg-[#232326]">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 font-mono">
                                {String(row.seq).padStart(2, "0")}
                            </span>
                            <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                                {detailSetModuleShort(row.modulePurpose)}
                            </span>
                            <RowStatusDot status={row.status} />
                            {row.isEdited && <span className="rounded bg-stone-200/70 px-1 py-0.5 text-[10px] text-stone-500 dark:bg-stone-700">已修改</span>}
                            {row.status === "failed" && row.error && (
                                <span className="max-w-[120px] truncate text-[10px] text-rose-500" title={row.error}>
                                    {row.error}
                                </span>
                            )}
                            <span className="ml-auto flex shrink-0 items-center gap-0.5 text-stone-400">
                                <RowIconBtn label="上移" disabled={index === 0} onClick={() => movePlanRow(plan.planId, row.seq, -1)}>↑</RowIconBtn>
                                <RowIconBtn label="下移" disabled={index === plan.rows.length - 1} onClick={() => movePlanRow(plan.planId, row.seq, 1)}>↓</RowIconBtn>
                                <RowIconBtn label="删除" onClick={() => deletePlanRow(plan.planId, row.seq)}>✕</RowIconBtn>
                            </span>
                        </div>

                        {/* 行标题与文案编辑 */}
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2">
                                <span className="w-14 shrink-0 text-[11px] font-medium text-stone-500 dark:text-stone-400" title="镜头意图与分镜设计导航说明，用于镜头规划与管理，不作为印刷文字印在画面上">镜头说明</span>
                                <input
                                    value={row.title ?? ""}
                                    onChange={(e) => updatePlanRow(plan.planId, row.seq, { title: e.target.value, isEdited: true })}
                                    className="min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-stone-50/50 px-2 py-1 text-xs font-medium text-stone-800 outline-none focus:border-amber-500 focus:bg-white dark:border-white/[0.1] dark:bg-[#1c1c1e] dark:text-stone-200"
                                    placeholder="分镜镜头说明（如：跑鞋全掌气垫微侧悬浮、水槽清洁实景）"
                                />
                            </label>

                            <label className="flex items-center gap-2">
                                <span className="w-14 shrink-0 text-[11px] font-medium text-stone-600 dark:text-stone-300" title="真正印刷排版在图片上的商业宣传文案">图内文案</span>
                                <input
                                    value={row.copy ?? ""}
                                    onChange={(e) => {
                                        const newCopy = e.target.value;
                                        const nextPrompt = updatePromptTypography(row.finalPrompt, newCopy, plan.config.addText);
                                        updatePlanRow(plan.planId, row.seq, { copy: newCopy, finalPrompt: nextPrompt, isEdited: true });
                                    }}
                                    className="min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-stone-50/50 px-2 py-1 text-xs font-medium text-stone-900 outline-none focus:border-amber-500 focus:bg-white dark:border-white/[0.1] dark:bg-[#1c1c1e] dark:text-stone-100"
                                    placeholder="实际印刷商业文案（如：按压出液 轻松净油）"
                                />
                            </label>
                        </div>

                        {row.visualDescription && (
                            <p className="mt-2 line-clamp-1 text-[11px] text-stone-400 dark:text-stone-500">
                                构图视觉：{row.visualDescription}
                            </p>
                        )}

                        {expandedSeq === row.seq ? (
                            <div className="mt-2.5 rounded-lg border border-stone-200 bg-stone-50/80 p-2.5 dark:border-stone-800 dark:bg-[#1c1c1e]">
                                <div className="mb-1 flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-400">微调 AI 原始提示词</span>
                                    <span className="text-[10px] text-stone-400 font-mono">{row.aspectRatio}</span>
                                </div>
                                <textarea
                                    value={draftPrompt}
                                    onChange={(event) => setDraftPrompt(event.target.value)}
                                    rows={4}
                                    className="thin-scrollbar block w-full resize-none rounded-lg border border-black/[0.1] bg-white p-2 text-[11px] leading-relaxed text-stone-700 outline-none focus:border-amber-500 dark:border-white/[0.1] dark:bg-[#232326] dark:text-stone-300"
                                />
                                <div className="mt-2 flex justify-end gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setExpandedSeq(null)}
                                        className="rounded-lg px-2.5 py-1 text-[11px] text-stone-500 hover:bg-stone-200/60 dark:hover:bg-[#2c2c2e]"
                                    >
                                        取消
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const nextPrompt = draftPrompt;
                                            const extractedCopy = extractCopyFromPromptText(draftPrompt);
                                            updatePlanRow(plan.planId, row.seq, {
                                                finalPrompt: nextPrompt,
                                                copy: extractedCopy !== undefined ? extractedCopy : row.copy,
                                                isEdited: true,
                                            });
                                            setExpandedSeq(null);
                                        }}
                                        style={{ backgroundColor: "#d97706", color: "#ffffff" }}
                                        className="rounded-lg px-3 py-1 text-[11px] font-semibold shadow-sm transition-all hover:opacity-90 active:scale-95 cursor-pointer text-white"
                                    >
                                        保存修改
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-2 flex items-center justify-between border-t border-black/[0.04] pt-1.5 dark:border-white/[0.04]">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setExpandedSeq(row.seq);
                                        setDraftPrompt(row.finalPrompt);
                                    }}
                                    className="text-[11px] text-amber-600 hover:text-amber-700 dark:text-amber-400 underline-offset-2 hover:underline"
                                >
                                    查看 / 展开提示词
                                </button>
                                <span className="text-[10px] text-stone-400 font-mono">{row.aspectRatio}</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* 规划就绪辅助提示：确认生成由底栏统一下发，此处仅提供重新规划回退入口 */}
            <div className="mt-4 flex items-center justify-between rounded-xl border border-black/[0.06] bg-stone-50/70 px-3 py-2.5 text-xs text-stone-500 dark:border-white/[0.08] dark:bg-[#232326] dark:text-stone-400">
                <span>规划已就绪，请在下方核对消耗积分并确认生成 ↓</span>
                <button
                    type="button"
                    onClick={() => useDetailSetStore.getState().setPhase("create")}
                    className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                >
                    ↺ 重新规划
                </button>
            </div>
        </div>
    );
}

function RowIconBtn({ children, label, disabled, onClick }: { children: React.ReactNode; label: string; disabled?: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
            className="flex size-6 items-center justify-center rounded-md text-[11px] transition-colors hover:bg-stone-200/70 hover:text-stone-700 disabled:opacity-25 dark:hover:bg-[#2c2c2e]"
        >
            {children}
        </button>
    );
}

function ModuleCard({
    purpose,
    short,
    desc,
    count,
    totalCount,
    onChange,
}: {
    purpose: string;
    short: string;
    desc: string;
    count: number;
    totalCount: number;
    onChange: (count: number) => void;
}) {
    const enabled = count > 0;
    const canIncrement = count < DETAIL_SET_MODULE_MAX_COUNT && totalCount < DETAIL_SET_TOTAL_MAX_COUNT;

    // 单行紧凑布局：语义化 div(role=checkbox) 承载点击与键盘操作，+/− 步进器置于卡片右侧（规避 button>input 非法嵌套）
    const [thumbFailed, setThumbFailed] = useState(false);
    const thumbnail = DETAIL_SET_MODULE_THUMBNAILS[purpose];
    return (
        <div
            role="checkbox"
            aria-checked={enabled}
            tabIndex={0}
            title={desc}
            onClick={() => {
                if (!enabled && totalCount >= DETAIL_SET_TOTAL_MAX_COUNT) {
                    message.warning(`单次最多支持生成 ${DETAIL_SET_TOTAL_MAX_COUNT} 张图片，已达批量上限`);
                    return;
                }
                onChange(enabled ? 0 : 1);
            }}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (!enabled && totalCount >= DETAIL_SET_TOTAL_MAX_COUNT) {
                        message.warning(`单次最多支持生成 ${DETAIL_SET_TOTAL_MAX_COUNT} 张图片，已达批量上限`);
                        return;
                    }
                    onChange(enabled ? 0 : 1);
                }
            }}
            className={`group flex h-11 min-w-0 cursor-pointer select-none items-center gap-2 rounded-xl border px-1.5 text-left transition-all ${
                enabled
                    ? "border-black/[0.1] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:border-white/[0.12] dark:bg-[#1c1c1e]"
                    : "border-transparent bg-stone-100/80 hover:bg-stone-100 dark:bg-[#232326] dark:hover:bg-[#2c2c2e]"
            }`}
        >
            <div
                className={`size-9 shrink-0 overflow-hidden rounded-lg ${
                    enabled ? "" : "saturate-[0.35] opacity-80"
                } bg-stone-100 dark:bg-stone-800`}
            >
                {thumbnail && !thumbFailed ? (
                    <img
                        src={thumbnail}
                        alt={`${purpose}缩略图`}
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover"
                        onError={() => setThumbFailed(true)}
                    />
                ) : (
                    <div className={`flex size-full items-center justify-center text-[11px] font-semibold ${enabled ? "text-amber-600" : "text-stone-400"}`}>
                        {short.slice(0, 1)}
                    </div>
                )}
            </div>
            <p className={`min-w-0 flex-1 truncate text-xs font-medium ${enabled ? "text-stone-900 dark:text-stone-100" : "text-stone-500 dark:text-stone-400"}`}>{short}</p>
            {enabled ? (
                <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
                    <button
                        type="button"
                        aria-label={`减少${short}数量`}
                        onClick={() => onChange(Math.max(0, count - 1))}
                        className="flex size-5 items-center justify-center rounded bg-stone-200/80 text-xs font-semibold text-stone-600 transition hover:bg-stone-300 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600"
                    >
                        −
                    </button>
                    <span className="w-4 text-center font-mono text-[11px] font-medium text-stone-800 dark:text-stone-200">{count}</span>
                    <button
                        type="button"
                        aria-label={`增加${short}数量`}
                        onClick={() => {
                            if (!canIncrement) {
                                if (totalCount >= DETAIL_SET_TOTAL_MAX_COUNT) {
                                    message.warning(`单次最多支持生成 ${DETAIL_SET_TOTAL_MAX_COUNT} 张图片，已达批量上限`);
                                } else if (count >= DETAIL_SET_MODULE_MAX_COUNT) {
                                    message.warning(`单模块最多支持选择 ${DETAIL_SET_MODULE_MAX_COUNT} 张`);
                                }
                                return;
                            }
                            onChange(count + 1);
                        }}
                        className={`flex size-5 items-center justify-center rounded bg-stone-200/80 text-xs font-semibold text-stone-600 transition hover:bg-stone-300 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600 ${!canIncrement ? "opacity-35 cursor-not-allowed" : ""}`}
                    >
                        +
                    </button>
                </div>
            ) : (
                <span className="shrink-0 text-sm leading-none text-stone-300 group-hover:text-stone-400 dark:text-stone-600 dark:group-hover:text-stone-500">＋</span>
            )}
        </div>
    );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center">
            <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-stone-900 dark:bg-amber-500" : "bg-stone-200 dark:bg-stone-700"}`}>
                <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
            </span>
        </button>
    );
}

/* ================= 手机预览（右栏 · 纯净沉浸式自适应预览） ================= */

export function PhonePreviewPanel({
    plan,
    onRetryRow,
    onRecoverRow,
}: {
    plan: DetailSetPlanSnapshot;
    onRetryRow?: (seq: number) => Promise<void> | void;
    onRecoverRow?: (seq: number) => Promise<void> | void;
    onUpdateRow?: (seq: number, patch: Partial<DetailSetRow>) => void;
    onUpdateMeta?: (patch: { productName?: string; price?: string }) => void;
}) {
    const { heroRows, detailRows } = useMemo(() => {
        const heroes = plan.rows.filter((row) => row.modulePurpose === "首图 / 主视觉");
        return {
            heroRows: heroes.length ? heroes : plan.rows.slice(0, 1),
            detailRows: heroes.length ? plan.rows.filter((row) => row.modulePurpose !== "首图 / 主视觉") : plan.rows.slice(1),
        };
    }, [plan.rows]);

    const [heroIndex, setHeroIndex] = useState(0);
    useEffect(() => setHeroIndex(0), [plan.planId]);
    const activeHero = heroRows[heroIndex] ?? heroRows[0] ?? null;
    const sellingPoints = plan.analysis?.sellingPoints ?? [];

    return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto py-2">
            <div className="relative h-[720px] w-full max-w-[360px] shrink-0 overflow-hidden rounded-[3.2rem] border border-black/80 bg-[radial-gradient(circle_at_top,_#565b64,_#1f2937_42%,_#030712_100%)] p-[9px] shadow-[0_30px_80px_rgba(15,23,42,0.45)]">
                <div className="relative isolate flex h-full flex-col overflow-hidden rounded-[2.8rem] bg-white">
                    {/* 状态栏 + 灵动岛（悬浮，不占留白行） */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-20 bg-gradient-to-b from-black/45 to-transparent" />
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-11 items-center justify-between px-7 text-white">
                        <span className="text-[12px] font-semibold drop-shadow">9:41</span>
                        <div className="absolute left-1/2 top-2 h-[27px] w-[100px] -translate-x-1/2 rounded-full bg-black" />
                        <span className="text-[11px] opacity-90">●●●</span>
                    </div>

                    <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-[#f7f7f7]">
                        {/* 轮播首图（按原始比例自然渲染）+ 悬浮导航 + 页码 */}
                        <section className="relative bg-white">
                            {activeHero ? (
                                activeHero.status === "success" && (activeHero.imageUrl || activeHero.storageKey) ? (
                                    <img
                                        src={activeHero.imageUrl}
                                        alt={activeHero.title}
                                        loading="eager"
                                        decoding="async"
                                        className="w-full cursor-zoom-in object-cover"
                                        style={{ aspectRatio: activeHero.aspectRatio.replace(":", " / ") }}
                                    />
                                ) : (
                                    <PhoneRowPlaceholder row={activeHero} onRetry={onRetryRow} onRecover={onRecoverRow} label={detailSetModuleShort(activeHero.modulePurpose)} />
                                )
                            ) : null}
                            <div className="absolute left-2.5 top-[52px] grid size-8 place-items-center rounded-full bg-black/35 text-white backdrop-blur-sm">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                    <path d="m14 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                            {heroRows.length > 1 && (
                                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-2.5 py-0.5 text-[11px] text-white">
                                    {heroIndex + 1}/{heroRows.length}
                                </span>
                            )}
                        </section>

                        {/* 小缩略图条 */}
                        {heroRows.length > 1 && (
                            <div className="flex items-center gap-1.5 bg-stone-200/90 px-2 py-1.5">
                                <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-stone-800 bg-white text-[9px] text-stone-700">图集</span>
                                {heroRows.slice(0, 4).map((row, index) => (
                                    <button
                                        key={row.seq}
                                        type="button"
                                        onClick={() => setHeroIndex(index)}
                                        className={`size-10 shrink-0 overflow-hidden rounded-lg border-2 bg-stone-100 ${index === heroIndex ? "border-stone-800" : "border-transparent"}`}
                                    >
                                        {row.status === "success" && row.imageUrl ? (
                                            <img src={row.imageUrl} alt={row.title} loading="lazy" decoding="async" className="size-full object-cover" />
                                        ) : (
                                            <span className="flex size-full items-center justify-center text-[9px] text-stone-400">
                                                {row.status === "pending" ? "…" : String(index + 1)}
                                            </span>
                                        )}
                                    </button>
                                ))}
                                <span className="ml-auto pr-1 text-[11px] text-stone-500">共 {heroRows.length} 张 ›</span>
                            </div>
                        )}

                        {/* 价格 + 标题 + 卖点 chips */}
                        <section className="space-y-2 bg-white px-4 pb-3.5 pt-3">
                            <div className="flex items-end justify-between">
                                <span className="text-[22px] font-bold leading-none text-orange-500">
                                    <span className="text-[14px]">¥</span> {plan.price || "99.00"}
                                </span>
                                <span className="text-[10px] text-stone-400">热销榜 Top 1 ⓘ</span>
                            </div>
                            <h3 className="text-[15px] font-semibold leading-snug text-stone-900">{plan.productName || "精品商品详情"}</h3>
                            {sellingPoints.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {sellingPoints.slice(0, 3).map((point) => (
                                        <span key={point} className="max-w-[210px] truncate rounded-md border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] text-stone-600">
                                            {point}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </section>

                        {/* 用户评价 */}
                        <section className="mt-2 bg-white px-4 py-3.5">
                            <div className="flex items-center justify-between">
                                <p className="text-[13px] font-semibold text-stone-900">用户评价 <span className="text-[10px] font-normal text-stone-400">(2)</span></p>
                                <span className="flex items-center gap-0.5 text-amber-500">
                                    <Sparkles className="size-3" />
                                    <span className="text-[11px] font-semibold">4.9</span>
                                    <span className="ml-1 text-[10px] text-stone-400">好评率 99% ›</span>
                                </span>
                            </div>
                            <div className="mt-2.5 space-y-2">
                                {PHONE_REVIEW_CARDS.map((review) => (
                                    <div key={review.user} className="rounded-xl bg-stone-50 p-2.5">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[11px] font-medium text-stone-800">{review.user}</p>
                                            <span className="text-[9px] text-stone-400">{review.tag}</span>
                                        </div>
                                        <p className="mt-1 text-[11px] leading-4 text-stone-600">{review.content}</p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* 详情长图流（标题/模块文案与图片自然对应） */}
                        <div className="mt-2">
                            {detailRows.map((row) => (
                                <section key={row.seq} className="bg-white">
                                    {row.status === "success" && row.imageUrl ? (
                                        <>
                                            <div className="relative bg-stone-100">
                                                <img
                                                    src={row.imageUrl}
                                                    alt={row.title}
                                                    loading="lazy"
                                                    decoding="async"
                                                    className="w-full cursor-zoom-in object-cover"
                                                    style={{ aspectRatio: row.aspectRatio.replace(":", " / ") }}
                                                />
                                                <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[9px] text-white">
                                                    {detailSetModuleShort(row.modulePurpose)}
                                                </span>
                                            </div>
                                            {(row.title || row.copy) && (
                                                <div className="px-4 py-2.5">
                                                    {row.title && <p className="text-[13px] font-semibold text-stone-900">{row.title}</p>}
                                                    {row.copy && <p className="mt-0.5 text-[11px] leading-4 text-stone-500">{row.copy}</p>}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <PhoneRowPlaceholder row={row} onRetry={onRetryRow} onRecover={onRecoverRow} label={detailSetModuleShort(row.modulePurpose)} />
                                    )}
                                </section>
                            ))}
                            <div className="bg-white px-4 pb-3 pt-2.5 text-center text-[9px] font-medium uppercase tracking-[0.2em] text-stone-300">
                                智影 · 电商套图手机预览
                            </div>
                        </div>
                    </div>

                    {/* 底部电商操作栏 */}
                    <div className="z-10 shrink-0 border-t border-black/[0.06] bg-white px-2.5 pb-1 pt-1.5">
                        <div className="flex items-center gap-0.5">
                            <BottomIcon label="店铺">
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 10l1.2-4.4A1.5 1.5 0 0 1 6.6 4.5h10.8a1.5 1.5 0 0 1 1.4 1.1L20 10" />
                                    <path d="M4 10a2.2 2.2 0 0 0 4 1.2A2.2 2.2 0 0 0 12 12a2.2 2.2 0 0 0 4-.8A2.2 2.2 0 0 0 20 10" />
                                    <path d="M5 12.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6.5" />
                                </svg>
                            </BottomIcon>
                            <BottomIcon label="客服">
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" />
                                </svg>
                            </BottomIcon>
                            <BottomIcon label="收藏" badge="166">
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
                                    <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z" />
                                </svg>
                            </BottomIcon>
                            <span className="h-9 flex-1 overflow-hidden rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-center text-[12px] font-semibold leading-9 text-white">加入购物车</span>
                            <span className="h-9 flex-1 overflow-hidden rounded-full bg-gradient-to-r from-orange-500 to-orange-600 text-center text-[12px] font-semibold leading-9 text-white">立即购买</span>
                        </div>
                        <div className="mx-auto mt-1 h-[3px] w-[100px] rounded-full bg-stone-900" />
                    </div>
                </div>
            </div>
        </div>
    );
}

const PHONE_REVIEW_CARDS = [
    { user: "晴晴小铺", tag: "日常搭配", content: "实物完成度很高，质感比图片还好，包装也很用心。" },
    { user: "晚风买家秀", tag: "真实反馈", content: "用了三天保湿效果明显，之前担心的问题完全没出现。" },
];

function RowStatusDot({ status }: { status: DetailSetRow["status"] }) {
    if (status === "pending") return <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400"><span className="size-1.5 animate-pulse rounded-full bg-amber-500" />生成中</span>;
    if (status === "failed") return <span className="flex items-center gap-1 text-[10px] text-rose-500"><span className="size-1.5 rounded-full bg-rose-500" />失败</span>;
    if (status === "success") return <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400"><span className="size-1.5 rounded-full bg-emerald-500" />完成</span>;
    return <span className="text-[10px] text-stone-400">待生成</span>;
}

function BottomIcon({ label, badge, children }: { label: string; badge?: string; children: React.ReactNode }) {
    return (
        <span className="flex w-[42px] shrink-0 flex-col items-center gap-0.5 text-stone-700">
            <span className="relative">
                {children}
                {badge && <span className="absolute -right-3 -top-1 text-[8px] leading-none text-stone-500">{badge}</span>}
            </span>
            <span className="text-[9px] leading-none">{label}</span>
        </span>
    );
}

function PhoneRowPlaceholder({
    row,
    onRetry,
    onRecover,
    label,
}: {
    row: DetailSetRow;
    onRetry?: (seq: number) => void;
    onRecover?: (seq: number) => void;
    label?: string;
}) {
    const isSaveOrUploadIssue = Boolean(
        (row.imageUrl && !row.storageKey) ||
        (row.taskId && (row.canRecoverMedia || (/上传|保存未完成|OSS|存储同步/i.test(row.error || "") && !/超时|稍后重试/i.test(row.error || ""))))
    );
    return (
        <div className="flex flex-col items-center justify-center gap-2 bg-stone-100 p-4" style={{ aspectRatio: row.aspectRatio.replace(":", " / ") }}>
            {row.status === "pending" ? (
                <>
                    <div className="flex items-center gap-1.5">
                        <span className="detail-set-pending-dot size-2 rounded-full bg-amber-500" />
                        <span className="detail-set-pending-dot size-2 rounded-full bg-amber-500" />
                        <span className="detail-set-pending-dot size-2 rounded-full bg-amber-500" />
                    </div>
                    <p className="text-xs font-medium text-stone-600">{label ? `${label} · AI生成中` : "AI生成中"}</p>
                </>
            ) : row.status === "failed" ? (
                <>
                    <p className="text-xs text-rose-500">
                        {label ? `${label} · ${isSaveOrUploadIssue ? "已生成未同步" : "生成失败"}` : (isSaveOrUploadIssue ? "已生成未同步" : "生成失败")}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {isSaveOrUploadIssue && onRecover && (
                            <button
                                type="button"
                                onClick={() => onRecover(row.seq)}
                                style={{ backgroundColor: "#d97706", color: "#ffffff" }}
                                className="rounded-full px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition-all hover:opacity-90 active:scale-95 cursor-pointer"
                            >
                                重试保存
                            </button>
                        )}
                        {onRetry && (
                            <button
                                type="button"
                                onClick={() => onRetry(row.seq)}
                                className="rounded-full bg-stone-900 px-3 py-1 text-[11px] font-medium text-white transition hover:bg-stone-700 cursor-pointer"
                            >
                                重新生成
                            </button>
                        )}
                    </div>
                </>
            ) : (
                <div className="flex flex-col items-center gap-1 text-stone-400">
                    <span className="rounded bg-stone-200/80 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                        {label ?? "待生成"}
                    </span>
                    <p className="text-[11px] text-stone-500 max-w-[200px] text-center truncate">{row.title || "规划分镜"}</p>
                </div>
            )}
        </div>
    );
}

/** 未使用引用守卫（保留 lucide 图标能力，便于后续快捷组件扩展） */
export const DETAIL_SET_QUICK_ACTION_ICONS = { ClipboardPaste, CheckSquare, FolderPlus, Trash2, Plus };
export const notifyDetailSetDemo = (text: string) => message.info(text);
// @opc-feature: detail_set_workflow [end]
