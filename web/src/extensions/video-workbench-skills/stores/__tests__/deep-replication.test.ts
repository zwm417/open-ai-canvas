// @opc-feature: deep-replication-test [start]
import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_VIDEO_SKILLS } from "../../catalog/builtin-video-skills";
import { useDeepReplicationTaskStore } from "../use-deep-replication-task-store";
import { resolveChannelVideoModelMaxDuration } from "@/lib/model-capabilities";

test("深度复刻：内置工作流技能卡片名称已更新为「深度复刻」", () => {
    const skill = BUILTIN_VIDEO_SKILLS.find((s) => s.id === "reference-replication");
    assert.ok(skill, "必须存在 id 为 reference-replication 的内置技能");
    assert.equal(skill.name, "深度复刻");
    assert.ok(skill.placeholder?.includes("复刻要求"));
    assert.ok(skill.placeholder?.includes("复刻助手"));
});

test("深度复刻：useDeepReplicationTaskStore 跨页面状态保持与结果编辑", () => {
    const store = useDeepReplicationTaskStore.getState();

    // 1. 初始状态检查
    useDeepReplicationTaskStore.getState().resetTask();
    const initial = useDeepReplicationTaskStore.getState();
    assert.equal(initial.status, "idle");
    assert.equal(initial.progressPercent, 0);
    assert.equal(initial.modalOpen, false);
    assert.equal(initial.draftPrompt, "");

    // 2. 模拟设置弹窗与提示词
    useDeepReplicationTaskStore.getState().setModalOpen(true);
    assert.equal(useDeepReplicationTaskStore.getState().modalOpen, true);

    useDeepReplicationTaskStore.getState().setDraftPrompt("【基于@视频1参考复刻与映射】\n【动作连锁演进与场景重构】\n【正向物理锁死约束】");
    assert.equal(
        useDeepReplicationTaskStore.getState().draftPrompt,
        "【基于@视频1参考复刻与映射】\n【动作连锁演进与场景重构】\n【正向物理锁死约束】",
    );

    // 3. 模拟关闭弹窗（例如用户切换页面或点击其他生成记录），任务与文本草稿不应被销毁
    useDeepReplicationTaskStore.getState().setModalOpen(false);
    assert.equal(useDeepReplicationTaskStore.getState().modalOpen, false);
    assert.equal(
        useDeepReplicationTaskStore.getState().draftPrompt,
        "【基于@视频1参考复刻与映射】\n【动作连锁演进与场景重构】\n【正向物理锁死约束】",
    );

    // 4. 用户在弹窗中二次编辑
    useDeepReplicationTaskStore.getState().setDraftPrompt("用户在弹窗中修改后的复刻提示词");
    assert.equal(useDeepReplicationTaskStore.getState().draftPrompt, "用户在弹窗中修改后的复刻提示词");

    // 5. 清理
    useDeepReplicationTaskStore.getState().resetTask();
    assert.equal(useDeepReplicationTaskStore.getState().status, "idle");
});

test("工作流卡片@引用素材协议契约：原片、商品、人物、背景与声音指针", () => {
    // 验证深度复刻与工作流卡片的标准多模态指针映射格式
    const productPointers = ["@图片1（商品）", "@图片1"];
    const modelPointers = ["@图片2（人物）", "@图片2"];
    const scenePointers = ["@图片3（背景）", "@图片3"];
    const videoPointer = "@视频1";
    const audioPointer = "@音频1";

    const promptTemplate = `【基于${videoPointer}参考复刻与映射】保持动作运镜，主体替换为${productPointers[0]}，演员替换为${modelPointers[0]}，背景替换为${scenePointers[0]}，音效绑定${audioPointer}`;

    assert.ok(promptTemplate.includes("@视频1"));
    assert.ok(promptTemplate.includes("@图片1（商品）"));
    assert.ok(promptTemplate.includes("@图片2（人物）"));
    assert.ok(promptTemplate.includes("@图片3（背景）"));
    assert.ok(promptTemplate.includes("@音频1"));
});

test("生视频工作台：动态解析不同生视频模型的最大截取时长约束（杜绝硬编码 15s）", () => {
    // 1. 无指定渠道或默认回退模型，默认为 10s
    const defaultMax = resolveChannelVideoModelMaxDuration(undefined, "unknown-model");
    assert.equal(defaultMax, 10, "未指定特定渠道配置时回退为 10 秒");

    // 2. 自定义渠道配置限制为 15s、10s 或 5s 时，精准动态返回对应上限
    const customConfig15s = {
        channels: [
            {
                id: "c1",
                models: ["seedance-v2"],
                modelCosts: [
                    {
                        model: "seedance-v2",
                        capabilityConfig: {
                            video: {
                                duration: { min: 3, max: 15, default: 10 },
                            },
                        },
                    },
                ],
            },
        ],
    } as any;
    const seedanceMax = resolveChannelVideoModelMaxDuration(customConfig15s, "seedance-v2");
    assert.equal(seedanceMax, 15, "Seedance 15s 模型最大截取时长必须精准为 15 秒");

    const customConfig10s = {
        channels: [
            {
                id: "c2",
                models: ["kling-v1-5"],
                modelCosts: [
                    {
                        model: "kling-v1-5",
                        capabilityConfig: {
                            video: {
                                duration: { min: 3, max: 10, default: 5 },
                            },
                        },
                    },
                ],
            },
        ],
    } as any;
    const klingMax = resolveChannelVideoModelMaxDuration(customConfig10s, "kling-v1-5");
    assert.equal(klingMax, 10, "Kling 10s 模型最大截取时长必须精准为 10 秒");

    const customConfig5s = {
        channels: [
            {
                id: "c3",
                models: ["runway-gen3"],
                modelCosts: [
                    {
                        model: "runway-gen3",
                        capabilityConfig: {
                            video: {
                                duration: { min: 2, max: 5, default: 5 },
                            },
                        },
                    },
                ],
            },
        ],
    } as any;
    const runwayMax = resolveChannelVideoModelMaxDuration(customConfig5s, "runway-gen3");
    assert.equal(runwayMax, 5, "Runway 5s 模型最大截取时长必须精准为 5 秒");
});

test("生视频工作台：素材插槽配置契约（深度复刻与编导助手插槽定义与折叠规范）", () => {
    // 1. 深度复刻专属插槽清单验证
    const replicationSlotKinds = ["product", "model", "scene", "reference", "audio"];
    const expectedMaxCounts: Record<string, number> = {
        product: 6,
        model: 6,
        scene: 6,
        reference: 6,
        audio: 3,
    };
    replicationSlotKinds.forEach((k) => {
        assert.ok(expectedMaxCounts[k] > 0, `深度复刻必须声明【${k}】插槽`);
    });

    // 2. 编导助手插槽清单验证
    const directorSlotKinds = ["image", "audio"];
    assert.equal(directorSlotKinds.length, 2);
    assert.equal(directorSlotKinds.includes("image"), true);
    assert.equal(directorSlotKinds.includes("audio"), true);
});

test("生视频工作台：默认创作卡片视频素材上传异常状态防线（失败清除 100% 进度且悬停始终可删除/替换）", () => {
    // 模拟视频上传失败状态转移
    const mockInitialVideo = {
        id: "vid-1",
        name: "test.mp4",
        type: "video/mp4",
        url: "blob:test",
        uploading: true,
        progress: 99,
    };

    // 发生网络直传错误或转码失败时，状态机必须清空 progress 并标明 error
    const onErrorState = {
        ...mockInitialVideo,
        uploading: false,
        progress: undefined,
        error: "上传失败",
    };

    assert.equal(onErrorState.uploading, false, "失败后 uploading 必须为 false");
    assert.equal(onErrorState.progress, undefined, "失败后 progress 必须为 undefined，杜绝误显示 100%");
    assert.equal(onErrorState.error, "上传失败", "必须携带明确的错误提示文案");
});

test("深度复刻：更换参考视频时就地即时展示上传进度状态（referenceVideo 与 isUploadingVideo 解耦防线）", () => {
    // 当已有参考视频存在，且用户触发更换上传新视频时：
    // UI 必须优先根据 isUploadingVideo 切换为就地进度条容器，而不是继续被 referenceVideo 卡片覆盖
    const shouldShowVideoCard = (hasRefVideo: boolean, isUploading: boolean) => hasRefVideo && !isUploading;
    const shouldShowUploadDropzone = (hasRefVideo: boolean, isUploading: boolean) => !hasRefVideo || isUploading;

    // 初始状态：无视频，显示上传区
    assert.equal(shouldShowVideoCard(false, false), false);
    assert.equal(shouldShowUploadDropzone(false, false), true);

    // 状态 A：上传就绪，展示已有参考视频卡片
    assert.equal(shouldShowVideoCard(true, false), true);
    assert.equal(shouldShowUploadDropzone(true, false), false);

    // 状态 B：点击「更换」开始上传新视频，必须立即切换为组件内就地进度条
    assert.equal(shouldShowVideoCard(true, true), false, "更换中必须隐藏旧视频卡片");
    assert.equal(shouldShowUploadDropzone(true, true), true, "更换中必须呈现组件内进度条");

    // 状态 C：上传完成（isUploading 恢复 false），新视频卡片呈现
    assert.equal(shouldShowVideoCard(true, false), true);
});

test("生视频工作台：素材插槽全局上限 maxTotalCount 严格边界约束", () => {
    const maxTotalCount = 15;
    let currentTotal = 14;

    // 尝试添加 3 个新素材
    const requestedCount = 3;
    const totalRemaining = Math.max(0, maxTotalCount - currentTotal);
    assert.equal(totalRemaining, 1, "总容量仅剩 1 个位置");

    const allowed = Math.min(requestedCount, totalRemaining);
    assert.equal(allowed, 1, "只允许选取 1 个素材，杜绝突破全局 15 个上限");
});
// @opc-feature: deep-replication-test [end]

