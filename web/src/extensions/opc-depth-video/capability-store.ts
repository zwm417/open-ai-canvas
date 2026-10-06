// @opc-feature: depth-video [start]
// 深度视频能力快照：探测结果的全局可读状态，供工具注册表 applicable 同步消费。
// 探测前默认乐观可用（桌面端首帧不闪烁）；纯浏览器在画布挂载时被探针立即降级为隐藏。

import { getDepthVideoBridge, isDesktopShell, type DepthVideoProbeResult } from "./bridge";

export type DepthVideoCapability = {
    probed: boolean;
    desktop: boolean;
    supported: boolean;
    runtimeReady: boolean;
    modelReady: boolean;
    cudaAvailable: boolean;
    reason: string;
};

let snapshot: DepthVideoCapability = {
    probed: false,
    desktop: true,
    supported: true,
    runtimeReady: true,
    modelReady: true,
    cudaAvailable: false,
    reason: "",
};

const listeners = new Set<() => void>();
let probing: Promise<void> | null = null;

export function getDepthVideoCapability(): DepthVideoCapability {
    return snapshot;
}

export function subscribeDepthVideoCapability(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function applyProbeResult(result: DepthVideoProbeResult) {
    snapshot = {
        probed: true,
        desktop: true,
        supported: result.supported,
        runtimeReady: result.runtimeReady,
        modelReady: result.modelReady,
        cudaAvailable: result.cudaAvailable,
        reason: result.reason || "",
    };
}

/** 幂等触发能力探测；画布挂载时调用一次即可。 */
export function ensureDepthVideoCapabilityProbe(): Promise<void> {
    if (probing) return probing;
    if (!isDesktopShell() || !getDepthVideoBridge()) {
        snapshot = {
            probed: true,
            desktop: false,
            supported: false,
            runtimeReady: false,
            modelReady: false,
            cudaAvailable: false,
            reason: "深度视频仅支持智影桌面端",
        };
        return Promise.resolve();
    }
    probing = (async () => {
        try {
            applyProbeResult(await getDepthVideoBridge()!.probe());
        } catch (error) {
            snapshot = {
                probed: true,
                desktop: true,
                supported: false,
                runtimeReady: false,
                modelReady: false,
                cudaAvailable: false,
                reason: error instanceof Error ? error.message : "深度组件探测失败",
            };
        }
        for (const listener of listeners) {
            try { listener(); } catch { /* 单个订阅者异常不阻断其余 */ }
        }
    })();
    return probing;
}
// @opc-feature: depth-video [end]
