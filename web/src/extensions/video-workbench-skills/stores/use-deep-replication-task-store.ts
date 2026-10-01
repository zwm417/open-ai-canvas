// @opc-feature: deep-replication-task-store [start]
import { create } from "zustand";
import { message } from "antd";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio } from "@/types/media";
import {
    executeSeedanceReplicationAnalysis,
    type SeedanceReplicationResult,
} from "../services/seedance-replication-service";

export interface DeepReplicationStartParams {
    videoSource: File | string;
    productImages: ReferenceImage[];
    modelImages: ReferenceImage[];
    sceneImages: ReferenceImage[];
    audioFiles?: ReferenceAudio[];
    supplementaryNotes?: string;
    effectiveConfig: any;
    targetModel?: string;
}

export interface DeepReplicationTaskStoreState {
    status: "idle" | "running" | "completed" | "failed";
    progressPercent: number;
    progressMessage: string;
    progressStage: string;
    errorText: string | null;
    result: SeedanceReplicationResult | null;
    draftPrompt: string;
    modalOpen: boolean;

    // Actions
    setModalOpen: (open: boolean) => void;
    setDraftPrompt: (prompt: string) => void;
    startTask: (params: DeepReplicationStartParams) => Promise<void>;
    resetTask: () => void;
}

export const useDeepReplicationTaskStore = create<DeepReplicationTaskStoreState>((set, get) => ({
    status: "idle",
    progressPercent: 0,
    progressMessage: "",
    progressStage: "init",
    errorText: null,
    result: null,
    draftPrompt: "",
    modalOpen: false,

    setModalOpen: (open) => {
        set({ modalOpen: open });
    },

    setDraftPrompt: (draftPrompt) => {
        set({ draftPrompt });
    },

    startTask: async (params) => {
        const current = get();
        if (current.status === "running") {
            // 已在运行中，直接打开弹窗展示当前进度
            set({ modalOpen: true });
            return;
        }

        set({
            status: "running",
            progressPercent: 5,
            progressMessage: "正在使用端侧硬件提取视频画面与音轨...",
            progressStage: "extract",
            errorText: null,
            result: null,
            draftPrompt: "",
            modalOpen: true,
        });

        try {
            const result = await executeSeedanceReplicationAnalysis({
                videoSource: params.videoSource,
                productImages: params.productImages,
                modelImages: params.modelImages,
                sceneImages: params.sceneImages,
                audioFiles: params.audioFiles,
                supplementaryNotes: params.supplementaryNotes,
                effectiveConfig: params.effectiveConfig,
                targetModel: params.targetModel,
                onProgress: (p) => {
                    set({
                        progressPercent: p.percent,
                        progressMessage: p.message,
                        progressStage: p.stage,
                    });
                },
            });

            set({
                status: "completed",
                progressPercent: 100,
                progressMessage: "复刻提示词分析生成完成",
                progressStage: "done",
                result,
                draftPrompt: result.prompt,
                errorText: null,
                modalOpen: true,
            });

            message.success("复刻提示词已分析生成完毕，可在弹窗内直接修改或应用到工作台");
        } catch (error: any) {
            const errorMsg = error?.message || "复刻分析失败，请检查多模态模型配置与网络连接";
            set({
                status: "failed",
                errorText: errorMsg,
                progressMessage: "分析失败",
            });
            message.error(errorMsg);
        }
    },

    resetTask: () => {
        set({
            status: "idle",
            progressPercent: 0,
            progressMessage: "",
            progressStage: "init",
            errorText: null,
            result: null,
            draftPrompt: "",
            modalOpen: false,
        });
    },
}));
// @opc-feature: deep-replication-task-store [end]
