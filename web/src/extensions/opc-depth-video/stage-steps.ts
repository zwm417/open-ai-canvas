// @opc-feature: depth-video [start]
// 桥接阶段文案 → 顶部进度条步进映射。
// startUploadStatus.update 是"N 步中第几步"语义（非百分比），必须经此映射，
// 否则推理百分比会被 clamp 成固定档位，进度显示与真实进度脱节。

export const DEPTH_TOTAL_STEPS = 4;

export function depthStageStep(stage?: string): number {
    if (!stage) return 3;
    if (stage.includes("排队") || stage.includes("准备")) return 2;
    if (stage.includes("分析")) return 3;
    if (stage.includes("生成") || stage.includes("已完成") || stage.includes("上传")) return 4;
    return 3;
}
// @opc-feature: depth-video [end]
