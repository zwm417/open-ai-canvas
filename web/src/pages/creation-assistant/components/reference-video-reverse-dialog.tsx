import { LoaderCircle, Video } from "lucide-react";
import { Modal } from "antd";

import { cn } from "@/lib/utils";
import type { AiConfig } from "@/stores/use-config-store";
import { useCreationAssistantStore } from "@/stores/use-creation-assistant-store";
import { ReferenceVideoReverseEditor } from "./reference-video-reverse-editor";

type Props = {
    open: boolean;
    onClose: () => void;
    reverseInferenceConfig: AiConfig;
    multimodalConfig: AiConfig;
    textConfig: AiConfig;
};

export default function ReferenceVideoReverseDialog({ open, onClose, reverseInferenceConfig, multimodalConfig, textConfig }: Props) {
    const draft = useCreationAssistantStore((state) => state.draft);
    const activeMode = draft.reverseActiveMode || (draft.deconstructPrompt && !draft.classicPrompt ? "deconstruct" : "classic");
    const updateDraft = useCreationAssistantStore((state) => state.updateDraft);

    const isRunning = draft.classicStatus === "preparing" || draft.classicStatus === "analyzing" || draft.deconstructStatus === "preparing" || draft.deconstructStatus === "analyzing";

    return (
        <Modal
            open={open}
            onCancel={isRunning ? undefined : onClose}
            closable={!isRunning}
            maskClosable={!isRunning}
            keyboard={!isRunning}
            footer={null}
            width={900}
            centered
            destroyOnClose={false}
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 font-semibold text-stone-900 dark:text-stone-100">
                        <Video className="size-4 text-amber-500" />
                        <span>参考生脚本</span>
                    </div>
                    <div className="flex items-center rounded-lg bg-stone-100 dark:bg-stone-800 p-0.5 border border-stone-200/60 dark:border-stone-700/60">
                        <button
                            type="button"
                            disabled={isRunning}
                            onClick={() => updateDraft({ reverseActiveMode: "classic" })}
                            className={cn(
                                "px-3 py-1 text-xs rounded-md transition-all font-medium flex items-center gap-1",
                                isRunning ? "cursor-not-allowed opacity-80" : "cursor-pointer",
                                activeMode === "classic"
                                    ? "!bg-amber-600 dark:!bg-amber-500 !text-white font-bold shadow-xs ring-1 ring-amber-700/40 dark:ring-amber-400/40"
                                    : "text-stone-600 dark:text-stone-300 hover:text-stone-950 dark:hover:text-white hover:bg-stone-200/70 dark:hover:bg-stone-700/70"
                            )}
                        >
                            {(draft.classicStatus === "preparing" || draft.classicStatus === "analyzing") && (
                                <LoaderCircle className="size-3 animate-spin text-white" />
                            )}
                            经典反推
                        </button>
                        <button
                            type="button"
                            disabled={isRunning}
                            onClick={() => updateDraft({ reverseActiveMode: "deconstruct" })}
                            className={cn(
                                "px-3 py-1 text-xs rounded-md transition-all font-medium flex items-center gap-1",
                                isRunning ? "cursor-not-allowed opacity-80" : "cursor-pointer",
                                activeMode === "deconstruct"
                                    ? "!bg-amber-600 dark:!bg-amber-500 !text-white font-bold shadow-xs ring-1 ring-amber-700/40 dark:ring-amber-400/40"
                                    : "text-stone-600 dark:text-stone-300 hover:text-stone-950 dark:hover:text-white hover:bg-stone-200/70 dark:hover:bg-stone-700/70"
                            )}
                        >
                            {(draft.deconstructStatus === "preparing" || draft.deconstructStatus === "analyzing") && (
                                <LoaderCircle className="size-3 animate-spin text-white" />
                            )}
                            创意反推
                        </button>
                    </div>
                </div>
            }
        >
            {open ? (
                <ReferenceVideoReverseEditor
                    reverseInferenceConfig={reverseInferenceConfig}
                    multimodalConfig={multimodalConfig}
                    textConfig={textConfig}
                    onClose={onClose}
                    activeMode={activeMode}
                    onActiveModeChange={(mode) => updateDraft({ reverseActiveMode: mode })}
                />
            ) : null}
        </Modal>
    );
}
export { ReferenceVideoReverseEditor };
