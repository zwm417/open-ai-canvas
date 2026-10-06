// @opc-feature: depth-video [start]
// 深度作业进程内登记表：记录"源节点 → jobId"映射，供工具定义禁用重复提交，
// 也供 Hook 在完成/失败后回收。仅内存态，页面刷新后由桥接 listActive 恢复。

const sourceJobs = new Map<string, string>();

export function markDepthJobActive(sourceNodeId: string, jobId: string) {
    sourceJobs.set(sourceNodeId, jobId);
}

export function markDepthJobSettled(sourceNodeId: string) {
    sourceJobs.delete(sourceNodeId);
}

export function isDepthJobActive(sourceNodeId: string): boolean {
    return sourceJobs.has(sourceNodeId);
}
// @opc-feature: depth-video [end]
