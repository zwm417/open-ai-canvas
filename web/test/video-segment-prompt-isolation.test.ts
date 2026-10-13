import { describe, expect, it } from "bun:test";
import { buildVideoCreationPlan, validateVideoCreationPlanForGeneration } from "@/lib/video-segment-contract";
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

    it("preserves multi-line dialogue, scene, and actions within shot blocks without single-line truncation", () => {
        const multilineScript = `### 视频总览
美式复古汉堡店，暖黄色灯光。

时间段0-3秒：
景别/角度：近景
场景与对白：小王站在店门前，手持牛肉汉堡对镜头说：“家人们，今天带你们尝尝这家爆款汉堡！”
真人感细节：汉堡芝士拉丝，手指轻微挤压面包。
音效/BGM：轻快音乐

时间段3-6秒：
景别/角度：特写
场景与对白：小王咬下一大口汉堡，惊喜地说：“汁水太丰富了，牛肉香气瞬间爆发！”
真人感细节：咀嚼动作自然，眼神发亮。`;

        const plan = buildVideoCreationPlan({
            source: "config",
            script: multilineScript,
            targetDurationSec: 6,
            model: "test-model",
            aspectRatio: "16:9",
            resolution: "720p",
            maxSegmentDurationSec: 3,
        });

        expect(plan.segments.length).toBe(2);
        expect(plan.shotBlocks.length).toBe(2);

        // 验证第 1 镜头块完整保留了所有后续属性行，而非只保留时间戳单行
        const shot1 = plan.shotBlocks[0];
        expect(shot1.text).toContain("时间段0-3秒：");
        expect(shot1.text).toContain("景别/角度：近景");
        expect(shot1.text).toContain("家人们，今天带你们尝尝这家爆款汉堡！");
        expect(shot1.text).toContain("汉堡芝士拉丝，手指轻微挤压面包");
        expect(shot1.text).toContain("音效/BGM：轻快音乐");

        // 验证第 2 镜头块完整保留了所有后续属性行与第二句口播
        const shot2 = plan.shotBlocks[1];
        expect(shot2.text).toContain("时间段3-6秒：");
        expect(shot2.text).toContain("汁水太丰富了，牛肉香气瞬间爆发！");
        expect(shot2.text).toContain("咀嚼动作自然，眼神发亮");

        // 验证组装到分段提示词中时两段各自拥有完整的对白与口播
        const prompt1 = buildVideoSegmentPrompt(plan, plan.segments[0]);
        const prompt2 = buildVideoSegmentPrompt(plan, plan.segments[1]);

        expect(prompt1).toContain("家人们，今天带你们尝尝这家爆款汉堡！");
        expect(prompt1).not.toContain("汁水太丰富了");

        expect(prompt2).toContain("汁水太丰富了，牛肉香气瞬间爆发！");
        expect(prompt2).not.toContain("家人们，今天带你们尝尝");
    });

    it("wraps physical segment containers (#### 【视频分段一：00:00 - 00:08】) correctly", () => {
        const segmentedScript = `### 视频总览
现代极简美妆护肤。

#### 【视频分段一：00:00 - 00:08】（首次生成）
时间段0-3秒：
景别/角度：中景
场景与对白：女主洗脸后对镜自语：“换季皮肤总是干燥泛红。”
时间段3-8秒：
场景与对白：女主取出精华液轻拍面部：“但用它修护，一整天都很水润！”
分段衔接态（本段收束）：女主微笑手持精华瓶置于脸颊旁。

#### 【视频分段二：00:08 - 00:15】（承接生成）
时间段8-12秒：
景别/角度：特写
场景与对白：镜头推近展示面部水光感：“你看这通透度，泛红完全退了。”
时间段12-15秒：
场景与对白：全屏特写展示产品：“点击左下角体验初秋水润奇迹。”
分段衔接态（全片收束）：产品与品牌Logo淡出收尾。`;

        const plan = buildVideoCreationPlan({
            source: "config",
            script: segmentedScript,
            targetDurationSec: 15,
            model: "test-model",
            aspectRatio: "16:9",
            resolution: "720p",
            maxSegmentDurationSec: 8,
        });

        expect(plan.segments.length).toBe(2);

        const prompt1 = buildVideoSegmentPrompt(plan, plan.segments[0]);
        const prompt2 = buildVideoSegmentPrompt(plan, plan.segments[1]);

        // 第 1 段包含第 1 段内部的多行台词与口播，以及本段收束态
        expect(prompt1).toContain("换季皮肤总是干燥泛红");
        expect(prompt1).toContain("但用它修护，一整天都很水润");
        expect(prompt1).not.toContain("你看这通透度");

        // 第 2 段包含第 2 段内部的多行台词与口播，以及全片收束态
        expect(prompt2).toContain("你看这通透度，泛红完全退了");
        expect(prompt2).toContain("点击左下角体验初秋水润奇迹");
        expect(prompt2).not.toContain("换季皮肤总是干燥泛红");
    });

    it("fail-closed gatekeeper intercepts multi-segment generation when segments cannot be resolved", () => {
        const unstructuredScript = `纯自然语言提示词：一只可爱的金毛犬在草地上奔跑追逐飞盘，阳光明媚，微风吹拂。`;

        const plan = buildVideoCreationPlan({
            source: "config",
            script: unstructuredScript,
            targetDurationSec: 15,
            model: "test-model",
            aspectRatio: "16:9",
            resolution: "720p",
            maxSegmentDurationSec: 10,
        });

        // 目标 15 秒超出模型上限 10 秒，规划出 2 段
        expect(plan.segments.length).toBe(2);

        // 但提示词为纯自然语言，未包含任何分段结构
        const validation = validateVideoCreationPlanForGeneration(plan);
        expect(validation.valid).toBe(false);
        expect(validation.error).toContain("超出模型单段上限");
        expect(validation.error).toContain("未能检测到有效的分段标记");

        // 并且在 runner 尝试组装时，多段空内容直接抛错，彻底阻止盲切发送
        expect(() => buildVideoSegmentPrompt(plan, plan.segments[0])).toThrow("严禁盲切执行");
    });

    it("parses reference script format (【第一分段：0-10秒 起势与痛点引入】) with subtitles and wraps verbatim", () => {
        const referenceFormatScript = `### 一、视频视听概述
- **商业类型**：电商带货
- **视听基调**：快节奏反转、生活化纪实

### 二、逐镜头分镜脚本

#### 【第一分段：0-10秒 起势与痛点引入】
【分段前导】：开场必须抓住用户痛点。
镜头 1（00:00-00:03）· 【痛点直击】
- **景别与运镜**：正面近景
- **画面视觉与微动作**：女主揉捏眉心，叹气：“天天熬夜加班，黑眼圈根本遮不住。”
- **声音音效与音乐**：清脆翻页声与钟表滴答声

镜头 2（00:03-00:10）· 【反常识转折】
- **画面视觉与微动作**：同事递来眼霜：“你还不知道这个宝藏吧？”
- **人物台词与对白**：“试试这个咖啡因眼霜，消肿绝了！”
- **分段接续点**：保持手持产品面向镜头姿态。

#### 【第二分段：10-20秒 功效展示与反转】
【分段前导】：核心卖点演示与见证。
镜头 3（00:10-00:16）· 【上眼实测】
- **景别与运镜**：特写，推镜头
- **画面视觉与微动作**：指腹点涂眼周，轻柔打圈推开，乳液秒化水。
- **人物台词与对白**：“冰凉肤感，吸收特别快。”

镜头 4（00:16-00:20）· 【成效与CTA】
- **画面视觉与微动作**：双眼对比，左眼紧致提亮。
- **人物台词与对白**：“看这紧致感！赶紧抢！”`;

        const plan = buildVideoCreationPlan({
            source: "reference_video",
            script: referenceFormatScript,
            targetDurationSec: 20,
            model: "test-model",
            aspectRatio: "9:16",
            resolution: "720p",
            maxSegmentDurationSec: 10,
        });

        expect(plan.segments.length).toBe(2);
        const validation = validateVideoCreationPlanForGeneration(plan);
        expect(validation.valid).toBe(true);

        const prompt1 = buildVideoSegmentPrompt(plan, plan.segments[0]);
        const prompt2 = buildVideoSegmentPrompt(plan, plan.segments[1]);

        // 第 1 段必须包含前导、标题副标题以及该段的镜头 1 和 镜头 2
        expect(prompt1).toContain("第一分段：0-10秒 起势与痛点引入");
        expect(prompt1).toContain("【分段前导】：开场必须抓住用户痛点");
        expect(prompt1).toContain("天天熬夜加班，黑眼圈根本遮不住");
        expect(prompt1).toContain("试试这个咖啡因眼霜，消肿绝了");
        expect(prompt1).toContain("保持手持产品面向镜头姿态");
        // 绝不包含第 2 段内容
        expect(prompt1).not.toContain("指腹点涂眼周");
        expect(prompt1).not.toContain("看这紧致感！赶紧抢！");

        // 第 2 段必须包含第 2 段的前导、镜头 3 和 镜头 4
        expect(prompt2).toContain("第二分段：10-20秒 功效展示与反转");
        expect(prompt2).toContain("【分段前导】：核心卖点演示与见证");
        expect(prompt2).toContain("指腹点涂眼周");
        expect(prompt2).toContain("看这紧致感！赶紧抢！");
        // 绝不包含第 1 段内容
        expect(prompt2).not.toContain("天天熬夜加班，黑眼圈根本遮不住");
    });

    it("respects user configured duration without being overridden by script text duration", () => {
        // 用户在输入框中留存了 15 秒的参考剧本文本，但用户在界面设置中选择时长为 6 秒
        const longScript = `#### 【第一分段：0-8秒】
镜头1（0-3秒）：近景
镜头2（3-8秒）：特写
#### 【第二分段：8-15秒】
镜头3（8-15秒）：全景`;

        // 当用户设置 6 秒，模型单段上限 10 秒时：
        // 目标时长 6 秒 <= 模型单段上限 10 秒，必须直接以 6 秒单段生成，绝不允许被剧本中的 15 秒覆写为多段！
        const plan = buildVideoCreationPlan({
            source: "config",
            script: longScript,
            targetDurationSec: 6,
            model: "test-model",
            aspectRatio: "16:9",
            resolution: "720p",
            maxSegmentDurationSec: 10,
        });

        expect(plan.segments.length).toBe(1);
        expect(plan.targetDurationSec).toBe(6);
        expect(plan.segments[0].keepDurationSec).toBe(6);
    });
});
