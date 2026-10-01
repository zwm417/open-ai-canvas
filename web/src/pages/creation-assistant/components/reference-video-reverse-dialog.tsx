import { Video } from "lucide-react";
import { Modal } from "antd";

import type { AiConfig } from "@/stores/use-config-store";
import { ReferenceVideoReverseEditor } from "./reference-video-reverse-editor";

type Props = {
    open: boolean;
    onClose: () => void;
    reverseInferenceConfig: AiConfig;
    multimodalConfig: AiConfig;
    textConfig: AiConfig;
};

export default function ReferenceVideoReverseDialog({ open, onClose, reverseInferenceConfig, multimodalConfig, textConfig }: Props) {
    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            width={900}
            centered
            destroyOnClose={false}
            title={
                <div className="flex items-center gap-2">
                    <Video className="size-4" />
                    <span>参考生脚本</span>
                </div>
            }
        >
            {open ? (
                <ReferenceVideoReverseEditor
                    reverseInferenceConfig={reverseInferenceConfig}
                    multimodalConfig={multimodalConfig}
                    textConfig={textConfig}
                    onClose={onClose}
                />
            ) : null}
        </Modal>
    );
}
export { ReferenceVideoReverseEditor };
