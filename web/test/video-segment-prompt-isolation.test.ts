import { describe, expect, it } from "bun:test";
import { buildVideoCreationPlan } from "@/lib/video-segment-contract";
import { buildVideoSegmentPrompt, getTieredPollingIntervalMs, VIDEO_SEGMENT_HARD_TIMEOUT_MS, VIDEO_SEGMENT_SOFT_TIMEOUT_MS } from "@/services/video-segment-runner";

describe("Video Segment Prompt Isolation & Tiered Polling", () => {
    const sampleScript = `### 视频总览
赛博朋克雨夜街道，霓虹灯倒映在积水路面，一位身穿黑色皮衣的侦探在快步疾走。

### 场景与光线
深蓝与暗紫色调，潮湿阴冷，强烈的侧逆光与车灯穿透雨雾。

#### 【视频分段1：0-5秒】
**镜头 1 (0-3秒)**：近景，侦探皮靴踏入水洼，水花四溅，慢镜头。
**镜头 2 (3-5秒)**：中景，侦探抬头望向高耸的霓虹招牌，眼神凝重。

#### 【视频分段2：5-10秒】
**镜头 3 (5-8秒)**：特写，侦探推开巷尾的金属铁门，门轴发出刺耳声响。
**镜头 4 (8-10秒)**：全景，昏暗的地下酒吧内部，烟雾缭绕，几名酒客转头注视。`;

    const plan = buildVideoCreationPlan({
        source: "config",
        script: sampleScript,
        targetDurationSec: 10,
        model: "test-model",
        aspectRatio: "16:9",
        resolution: "720p",
        maxSegmentDurationSec: 5,
    });

    it("isolates prompt content per segment and includes shared header", () => {
        expect(plan.segments.length).toBe(2);

        const prompt1 = buildVideoSegmentPrompt(plan, plan.segments[0]);
        const prompt2 = buildVideoSegmentPrompt(plan, plan.segments[1]);

        // 两个分段均必须包含开头的全局共用设定（总览与场景光线）
        expect(prompt1).toContain("赛博朋克雨夜街道");
        expect(prompt1).toContain("深蓝与暗紫色调");
        expect(prompt2).toContain("赛博朋克雨夜街道");
        expect(prompt2).toContain("深蓝与暗紫色调");

        // 分段 1 必须只包含镜头 1 和 镜头 2，严禁出现分段 2 的镜头 3、镜头 4 内容
        expect(prompt1).toContain("侦探皮靴踏入水洼");
        expect(prompt1).toContain("眼神凝重");
        expect(prompt1).not.toContain("推开巷尾的金属铁门");
        expect(prompt1).not.toContain("昏暗的地下酒吧内部");

        // 分段 2 必须只包含镜头 3 和 镜头 4，严禁出现分段 1 的开场镜头
        expect(prompt2).toContain("推开巷尾的金属铁门");
        expect(prompt2).toContain("昏暗的地下酒吧内部");
        expect(prompt2).not.toContain("侦探皮靴踏入水洼");

        // 严禁包含历史上的【完整脚本】全篇噪音转储
        expect(prompt1).not.toContain("【完整脚本】");
        expect(prompt2).not.toContain("【完整脚本】");

        // 中间段严禁提前收束，尾段包含自然收束指示
        expect(prompt1).toContain("连续性禁令");
        expect(prompt2).toContain("收束要求");
    });

    it("calculates tiered polling intervals correctly across 4 stages", () => {
        // 阶段 1：0 ~ 1 分钟（免探静默期，距离 60s 的剩余毫秒数）
        expect(getTieredPollingIntervalMs(0)).toBe(60_000);
        expect(getTieredPollingIntervalMs(20_000)).toBe(40_000);
        expect(getTieredPollingIntervalMs(59_500)).toBe(1000); // 最小 1000ms

        // 阶段 2：1 ~ 3 分钟（第一阶段探测，15~20 秒，当前 18 秒）
        expect(getTieredPollingIntervalMs(60_000)).toBe(18_000);
        expect(getTieredPollingIntervalMs(120_000)).toBe(18_000);
        expect(getTieredPollingIntervalMs(179_999)).toBe(18_000);

        // 阶段 3：3 ~ 15 分钟（第二阶段高峰探测，10~15 秒，当前 12 秒）
        expect(getTieredPollingIntervalMs(180_000)).toBe(12_000);
        expect(getTieredPollingIntervalMs(300_000)).toBe(12_000);
        expect(getTieredPollingIntervalMs(899_999)).toBe(12_000);

        // 阶段 4：15 分钟以上（低频长尾长时托管期，30~60 秒，当前 30 秒）
        expect(getTieredPollingIntervalMs(900_000)).toBe(30_000);
        expect(getTieredPollingIntervalMs(1_800_000)).toBe(30_000);
        expect(getTieredPollingIntervalMs(3_500_000)).toBe(30_000);

        // 超时常量对齐
        expect(VIDEO_SEGMENT_SOFT_TIMEOUT_MS).toBe(15 * 60 * 1000);
        expect(VIDEO_SEGMENT_HARD_TIMEOUT_MS).toBe(60 * 60 * 1000);
    });
});
