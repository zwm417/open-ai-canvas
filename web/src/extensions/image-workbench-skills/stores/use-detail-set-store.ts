// @opc-feature: detail_set_workflow [start]
// 电商套图规划状态机：草稿 → 规划 → 确认 → 逐行生成回填。
// 持久化策略：规划快照随 GenerationLog.detailSet 落盘（localforage + 远端同步），本 store 为内存态；
// 账号隔离：hydrate 前校验 userScope，切换账号时 resetForScope 熔断（对齐 index.tsx 现有做法）。

import { create } from "zustand";

import {
    DETAIL_SET_DEFAULT_SELECTIONS,
    type DetailSetDraft,
    type DetailSetPlanSnapshot,
    type DetailSetRow,
} from "../types/detail-set";
import { extractCopyFromPromptText, synthesizeDynamicAdCopy } from "../core/detail-set-planner";

export type DetailSetPhase = "create" | "planning" | "review";

type DetailSetState = {
    draft: DetailSetDraft;
    phase: DetailSetPhase;
    planningStage: number;
    planError?: string;
    plan: DetailSetPlanSnapshot | null;
    activePlanId: string | null;
    resultView: "grid" | "phone";
    history: { past: DetailSetRow[][]; future: DetailSetRow[][] };

    setDraft: (patch: Partial<DetailSetState["draft"]>) => void;
    setPhase: (phase: DetailSetPhase) => void;
    setPlanningStage: (stage: number) => void;
    setPlanError: (error?: string) => void;
    setPlan: (plan: DetailSetPlanSnapshot) => void;
    setResultView: (view: "grid" | "phone") => void;

    updatePlanRow: (planId: string, seq: number, patch: Partial<DetailSetRow>) => void;
    movePlanRow: (planId: string, seq: number, dir: -1 | 1) => void;
    deletePlanRow: (planId: string, seq: number) => void;
    undoPlanRows: (planId: string) => void;
    redoPlanRows: (planId: string) => void;
    updatePlanMeta: (planId: string, patch: { productName?: string; price?: string }) => void;

    /** 逐行生成结果回填（由 index.tsx 的行级 onSettled 回调驱动） */
    applyRowResult: (planId: string, seq: number, outcome: { imageUrl?: string; storageKey?: string; taskId?: string; error?: string }) => void;
    /** 从历史日志快照恢复（预览历史批次时） */
    hydrateFromSnapshot: (snapshot: DetailSetPlanSnapshot, userScope: string, preferredPhase?: DetailSetPhase) => void;
    /** 主动重置电商套图工作流（新建会话时调用） */
    resetWorkflow: () => void;
    resetForScope: (userScope: string) => void;
};

let boundUserScope = "";

export const useDetailSetStore = create<DetailSetState>((set, get) => ({
    draft: {
        selections: { ...DETAIL_SET_DEFAULT_SELECTIONS },
        productSafe: true,
        stylePresetId: "studio_premium",
        outputLanguage: "zh",
        extraInstruction: "",
        productName: "",
        productNameSource: "auto",
        category: "auto",
        keySellingPoints: "",
    },
    phase: "create",
    planningStage: 0,
    plan: null,
    activePlanId: null,
    resultView: "phone",
    history: { past: [], future: [] },

    setDraft: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
    setPhase: (phase) => set({ phase }),
    setPlanningStage: (planningStage) => set({ planningStage }),
    setPlanError: (planError) => set({ planError }),
    setPlan: (plan) => set({ plan, activePlanId: plan.planId, planError: undefined, history: { past: [], future: [] } }),
    setResultView: (resultView) => set({ resultView }),

    updatePlanRow: (planId, seq, patch) =>
        set((state) => {
            if (state.plan?.planId !== planId) return state;
            const nextRows = state.plan.rows.map((row) => (row.seq === seq ? { ...row, ...patch } : row));
            return {
                plan: { ...state.plan, rows: nextRows },
                history: patch.isEdited || patch.title !== undefined || patch.copy !== undefined
                    ? { past: [...state.history.past.slice(-40), state.plan.rows], future: [] }
                    : state.history,
            };
        }),

    movePlanRow: (planId, seq, dir) =>
        set((state) => {
            if (state.plan?.planId !== planId) return state;
            const rows = [...state.plan.rows];
            const index = rows.findIndex((row) => row.seq === seq);
            const target = index + dir;
            if (index < 0 || target < 0 || target >= rows.length) return state;
            [rows[index], rows[target]] = [rows[target], rows[index]];
            return {
                plan: { ...state.plan, rows: rows.map((row, i) => ({ ...row, seq: i + 1 })) },
                history: { past: [...state.history.past.slice(-40), state.plan.rows], future: [] },
            };
        }),

    deletePlanRow: (planId, seq) =>
        set((state) => {
            if (state.plan?.planId !== planId) return state;
            return {
                plan: { ...state.plan, rows: state.plan.rows.filter((row) => row.seq !== seq).map((row, i) => ({ ...row, seq: i + 1 })) },
                history: { past: [...state.history.past.slice(-40), state.plan.rows], future: [] },
            };
        }),

    undoPlanRows: (planId) =>
        set((state) => {
            if (state.plan?.planId !== planId || !state.history.past.length) return state;
            const previous = state.history.past[state.history.past.length - 1];
            return {
                plan: { ...state.plan, rows: previous },
                history: { past: state.history.past.slice(0, -1), future: [state.plan.rows, ...state.history.future].slice(0, 40) },
            };
        }),

    redoPlanRows: (planId) =>
        set((state) => {
            if (state.plan?.planId !== planId || !state.history.future.length) return state;
            const next = state.history.future[0];
            return {
                plan: { ...state.plan, rows: next },
                history: { past: [...state.history.past, state.plan.rows], future: state.history.future.slice(1) },
            };
        }),

    updatePlanMeta: (planId, patch) =>
        set((state) => {
            if (state.plan?.planId !== planId) return state;
            return {
                plan: {
                    ...state.plan,
                    productName: patch.productName ?? state.plan.productName,
                    price: patch.price ?? state.plan.price,
                },
            };
        }),

    applyRowResult: (planId, seq, outcome) =>
        set((state) => {
            if (state.plan?.planId !== planId) return state;
            const rows = state.plan.rows.map((row) =>
                row.seq === seq
                    ? {
                          ...row,
                          status: outcome.error ? ("failed" as const) : ("success" as const),
                          imageUrl: outcome.imageUrl ?? row.imageUrl,
                          storageKey: outcome.storageKey ?? row.storageKey,
                          taskId: outcome.taskId ?? row.taskId,
                          error: outcome.error,
                      }
                    : row,
            );
            return { plan: { ...state.plan, rows } };
        }),

    hydrateFromSnapshot: (snapshot, userScope, preferredPhase) => {
        if (boundUserScope && boundUserScope !== userScope) return; // 跨账号快照拒绝注入
        const targetPhase = preferredPhase ?? (snapshot.rows && snapshot.rows.length > 0 ? "review" : "create");
        // 正向自愈：对历史日志或快照中遗留的残缺空文案自动执行自愈修复，杜绝老旧快照反噬抹空当前工作区
        const addText = snapshot.config?.addText ?? (snapshot.config?.outputLanguage !== "none");
        const healedRows = (snapshot.rows || []).map((row) => {
            let copy = row.copy;
            if (addText && (!copy || copy.trim().length < 2)) {
                const fromPrompt = extractCopyFromPromptText(row.finalPrompt);
                if (fromPrompt) {
                    copy = fromPrompt;
                } else {
                    copy = synthesizeDynamicAdCopy({
                        productName: snapshot.productName || snapshot.analysis?.productName || "",
                        sellingPoints: snapshot.analysis?.sellingPoints,
                        purpose: row.modulePurpose,
                        category: snapshot.category,
                        seq: row.seq,
                    });
                }
            }
            return { ...row, copy };
        });
        const healedSnapshot: DetailSetPlanSnapshot = {
            ...snapshot,
            rows: healedRows,
        };
        set({ plan: healedSnapshot, activePlanId: healedSnapshot.planId, phase: targetPhase, history: { past: [], future: [] } });
    },

    resetWorkflow: () => {
        set({
            draft: {
                selections: { ...DETAIL_SET_DEFAULT_SELECTIONS },
                productSafe: true,
                stylePresetId: "studio_premium",
                outputLanguage: "zh",
                extraInstruction: "",
                productName: "",
                productNameSource: "auto",
                category: "auto",
                keySellingPoints: "",
            },
            phase: "create",
            planningStage: 0,
            planError: undefined,
            plan: null,
            activePlanId: null,
            resultView: "phone",
            history: { past: [], future: [] },
        });
    },

    resetForScope: (userScope) => {
        if (boundUserScope === userScope) return;
        boundUserScope = userScope;
        get().resetWorkflow();
    },
}));

/** 供日志恢复路径判断快照归属（与 store 绑定的 scope 比较） */
export const isDetailSetScopeBound = (userScope: string): boolean => boundUserScope === userScope;

export const getDetailSetBoundScope = (): string => boundUserScope;

// 供 hydrate 前绑定（首次使用即绑定当前 scope）
export const bindDetailSetScope = (userScope: string): void => {
    if (!boundUserScope) boundUserScope = userScope;
};

export const useDetailSetActivePlan = (): DetailSetPlanSnapshot | null => useDetailSetStore((state) => (state.activePlanId ? state.plan : null));

export const useDetailSetPlanById = (planId: string | null | undefined): DetailSetPlanSnapshot | null =>
    useDetailSetStore((state) => (planId && state.plan?.planId === planId ? state.plan : null));

export const useDetailSetCanUndo = (): boolean => useDetailSetStore((state) => state.history.past.length > 0);

export const useDetailSetCanRedo = (): boolean => useDetailSetStore((state) => state.history.future.length > 0);

export const getDetailSetPhase = (): DetailSetPhase => useDetailSetStore.getState().phase;
// @opc-feature: detail_set_workflow [end]
