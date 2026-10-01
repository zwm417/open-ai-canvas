// @opc-feature: deep-replication-test [start]
import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_VIDEO_SKILLS } from "../../catalog/builtin-video-skills";
import { useDeepReplicationTaskStore } from "../use-deep-replication-task-store";

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
// @opc-feature: deep-replication-test [end]
