import { describe, expect, it } from "bun:test";
import {
    fetchVaultPrompt,
    getVaultMacro,
    preparePromptForExecution,
    clearPromptCache,
    prewarmPromptVault,
    resolveVaultMacrosInBody,
    HEADER_CANVAS_SYSTEM_PROMPT_ID,
    VAULT_PROMPT_IDS,
} from "../src/services/api/prompt-vault";

describe("Prompt Vault Client 提示词安全金库与智能双通道编织", () => {
    it("可成功拉取全量 5 大标准化提示词资产并具备本地环境自适应加载", async () => {
        clearPromptCache();

        const prompts = await Promise.all([
            fetchVaultPrompt(VAULT_PROMPT_IDS.CREATIVE_REVERSE),
            fetchVaultPrompt(VAULT_PROMPT_IDS.CREATIVE_REPLICATION),
            fetchVaultPrompt(VAULT_PROMPT_IDS.CREATION_ASSISTANT),
            fetchVaultPrompt(VAULT_PROMPT_IDS.VIDEO_WORKBENCH),
            fetchVaultPrompt(VAULT_PROMPT_IDS.VIDEO_REVERSE_CLASSIC),
            fetchVaultPrompt(VAULT_PROMPT_IDS.SEEDANCE_REPLICATION),
        ]);

        expect(prompts[0]).toContain("突变轨作为辅助参考候选点");
        expect(prompts[1]).toContain("iPhone UGC 四段式规范");
        expect(prompts[2]).toContain("顶级短视频编导");
        expect(prompts[3]).toContain("商业标的洞察");
        expect(prompts[4]).toContain("工业级”像素拆解");
        expect(prompts[5]).toContain("Seedance-2.0 视频扩散大模型");

        for (const p of prompts) {
            expect(p.length).toBeGreaterThan(100);
            expect(p.startsWith("\uFEFF")).toBe(false);
        }
    });

    it("getVaultMacro 返回标准服务端宏格式", () => {
        expect(getVaultMacro("creation-assistant")).toBe("__VAULT_PROMPT__:creation-assistant");
        expect(getVaultMacro("video-workbench")).toBe("__VAULT_PROMPT__:video-workbench");
    });

    it("preparePromptForExecution: 公网商业渠道采用 0 KB 宏引用与注入请求头，杜绝明文泄露", async () => {
        const res = await preparePromptForExecution({
            promptId: VAULT_PROMPT_IDS.CREATION_ASSISTANT,
            userCustomNotes: "主角穿白色体恤",
            isLocalChannel: false,
        });

        // 验证前端不传输 57KB 提示词正文
        expect(res.systemPrompt).not.toContain("顶级短视频编导");
        expect(res.systemPrompt).toContain("__VAULT_PROMPT__:creation-assistant");
        expect(res.systemPrompt).toContain("【用户特别要求】\n主角穿白色体恤");
        expect(res.headers?.[HEADER_CANVAS_SYSTEM_PROMPT_ID]).toBe("creation-assistant");
    });

    it("preparePromptForExecution: 本地私网渠道 (LAN) 自动展开完整正文以供给本地 Ollama/vLLM", async () => {
        const res = await preparePromptForExecution({
            promptId: VAULT_PROMPT_IDS.CREATION_ASSISTANT,
            userCustomNotes: "无特殊要求",
            isLocalChannel: true,
        });

        // 验证本地模式展开真实提示词正文
        expect(res.systemPrompt).toContain("顶级短视频编导");
        expect(res.systemPrompt).toContain("【用户特别要求】\n无特殊要求");
        expect(res.headers).toBeUndefined();
    });

    it("prewarmPromptVault: 能够安全并发预热所有金库提示词到内存缓存", async () => {
        clearPromptCache();
        await prewarmPromptVault();
        const p1 = await fetchVaultPrompt(VAULT_PROMPT_IDS.VIDEO_WORKBENCH);
        expect(p1).toContain("商业标的洞察");
    });

    it("resolveVaultMacrosInBody: 本地渠道 JSON 请求体安全展开并保证有效 JSON 转义", async () => {
        const bodyObj = {
            model: "llama-3-8b",
            messages: [
                {
                    role: "system",
                    content: "__VAULT_PROMPT__:creation-assistant\n\n【用户特别要求】\n主角穿白色体恤",
                },
                {
                    role: "user",
                    content: "请生成开场镜头",
                },
            ],
        };
        const rawJson = JSON.stringify(bodyObj);
        const resolved = await resolveVaultMacrosInBody(rawJson);

        expect(typeof resolved).toBe("string");
        expect(resolved).not.toContain("__VAULT_PROMPT__:");
        expect(resolved).toContain("顶级短视频编导");
        expect(resolved).toContain("主角穿白色体恤");

        // 核心铁律：验证展开后依然是 100% 格式合法的 JSON 字符串
        const parsed = JSON.parse(resolved as string);
        expect(parsed.messages[0].content).toContain("顶级短视频编导");
        expect(parsed.messages[0].content).toContain("主角穿白色体恤");
    });

    it("resolveVaultMacrosInBody: 支持多模态 Parts 数组与多字段嵌套宏展开", async () => {
        const bodyObj = {
            input: [
                {
                    role: "system",
                    content: [
                        { type: "text", text: "__VAULT_PROMPT__:video-workbench" },
                    ],
                },
            ],
        };
        const rawJson = JSON.stringify(bodyObj);
        const resolved = await resolveVaultMacrosInBody(rawJson);

        const parsed = JSON.parse(resolved as string);
        expect(parsed.input[0].content[0].text).toContain("商业标的洞察");
        expect(parsed.input[0].content[0].text).not.toContain("__VAULT_PROMPT__:");
    });

    it("resolveVaultMacrosInBody: 无宏请求或非字符串请求极速放行 0 开销", async () => {
        const normalBody = JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "hello" }] });
        const res = await resolveVaultMacrosInBody(normalBody);
        expect(res).toBe(normalBody);

        expect(await resolveVaultMacrosInBody(null)).toBeNull();
        expect(await resolveVaultMacrosInBody(undefined)).toBeUndefined();
    });
});
