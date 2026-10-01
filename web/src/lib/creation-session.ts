import type { AiConfig } from "@/stores/use-config-store";
import type { CreationAssistantDraft } from "@/stores/use-creation-assistant-store";
import type { VideoWorkbenchDraft } from "@/stores/use-video-workbench-store";
import type { VideoGenerationTask } from "@/services/api/video";

export type CreationOutputRecord = {
    outputId: string;
    mediaType: "video" | "image" | "audio" | "text";
    role: "variant" | "segment" | "final";
    status: "pending" | "success" | "failed";
    storageKey?: string;
    url?: string;
    name?: string;
    segmentIndex?: number;
    startSec?: number;
    endSec?: number;
    width?: number;
    height?: number;
    durationMs?: number;
    bytes?: number;
    mimeType?: string;
    error?: string;
};

export type CreationRunRecord = {
    runId: string;
    createdAt: number;
    updatedAt: number;
    status: "pending" | "success" | "failed";
    prompt: string;
    model: string;
    config: Partial<AiConfig>;
    task?: VideoGenerationTask;
    outputs: CreationOutputRecord[];
    error?: string;
};

export type CreationSessionSnapshot = {
    videoDraft: VideoWorkbenchDraft;
    creationAssistant: CreationAssistantDraft | null;
};

export type CreationSessionRecord = {
    schemaVersion: "creation-session-v2";
    sessionId: string;
    createdAt: number;
    updatedAt: number;
    snapshot: CreationSessionSnapshot;
    runs: CreationRunRecord[];
};

export function createCreationSession(sessionId: string, snapshot: CreationSessionSnapshot, now = Date.now()): CreationSessionRecord {
    return { schemaVersion: "creation-session-v2", sessionId, createdAt: now, updatedAt: now, snapshot, runs: [] };
}

export function replaceCreationSessionSnapshot(session: CreationSessionRecord, snapshot: CreationSessionSnapshot, now = Date.now()): CreationSessionRecord {
    return { ...session, updatedAt: now, snapshot };
}

export function appendCreationRun(session: CreationSessionRecord, run: CreationRunRecord): CreationSessionRecord {
    return {
        ...session,
        updatedAt: run.updatedAt || Date.now(),
        runs: [run, ...session.runs.filter((item) => item.runId !== run.runId)],
    };
}
