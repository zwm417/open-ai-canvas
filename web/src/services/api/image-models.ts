import { sanitizeChannelModelCatalogItem, type ChannelModelCatalogItem } from "@/lib/channel-model-catalog";
import { createChannelTransport } from "@/services/api/channel-transport";
import { isLocalOrPrivateUpstream } from "@/services/api/custom-channel-relay";
import { readAxiosError, validateGeminiPayload } from "@/services/api/image-response";
import { geminiApiUrl, geminiHeaders } from "@/services/api/image-transport";
import { http } from "@/services/api/request";
import { buildApiUrl, type AiConfig, type ChannelHeader, type ModelChannel } from "@/stores/use-config-store";

const defaultGeminiConfig: Pick<AiConfig, "baseUrl" | "apiKey" | "apiFormat" | "model" | "systemPrompt"> = {
    baseUrl: "https://generativelanguage.googleapis.com",
    apiKey: "",
    apiFormat: "gemini",
    model: "",
    systemPrompt: "",
};

type GeminiModelPayload = { models?: Array<{ name?: string }> };
type OpenAIModelPayload = { data?: Array<{ id?: string }>; error?: { message?: string } };

export async function fetchImageModels(config: Pick<AiConfig, "baseUrl" | "apiKey" | "apiFormat"> & { headers?: ChannelHeader[] }) {
    try {
        if (config.apiFormat === "gemini") {
            const requestConfig = { ...defaultGeminiConfig, ...config };
            const payload = await createChannelTransport(requestConfig, "image").get<GeminiModelPayload>(geminiApiUrl(requestConfig), { headers: geminiHeaders(requestConfig) });
            validateGeminiPayload(payload);
            return (payload.models || [])
                .map((model) => model.name?.replace(/^models\//, ""))
                .filter((id): id is string => Boolean(id))
                .sort((a, b) => a.localeCompare(b));
        }
        // @opc-feature: channel-model-fetch-fallback [start]
        try {
            const payload = await createChannelTransport(config, "image").get<OpenAIModelPayload>(buildApiUrl(config.baseUrl, "/models"));
            const items = (payload.data || [])
                .map((model) => model.id)
                .filter((id): id is string => Boolean(id))
                .sort((a, b) => a.localeCompare(b));
            if (items.length > 0) return items;
        } catch {
            // 继续尝试降级探测
        }
        // Ollama 原生 /api/tags 兼容探测 (适用于未填写 /v1 的本地服务)
        try {
            const ollamaPayload = await createChannelTransport(config, "image").get<{ models?: Array<{ name?: string; model?: string }> }>(`${config.baseUrl.replace(/\/+$/, "")}/api/tags`);
            if (ollamaPayload.models && ollamaPayload.models.length > 0) {
                const items = ollamaPayload.models
                    .map((m) => m.name || m.model)
                    .filter((id): id is string => Boolean(id))
                    .sort((a, b) => a.localeCompare(b));
                if (items.length > 0) return items;
            }
        } catch {}
        try {
            const geminiConfig = { ...defaultGeminiConfig, ...config, apiFormat: "gemini" as const };
            const payload = await createChannelTransport(geminiConfig, "image").get<GeminiModelPayload>(geminiApiUrl(geminiConfig), { headers: geminiHeaders(geminiConfig) });
            if (payload.models && payload.models.length > 0) {
                return payload.models
                    .map((model) => model.name?.replace(/^models\//, ""))
                    .filter((id): id is string => Boolean(id))
                    .sort((a, b) => a.localeCompare(b));
            }
        } catch {}
        return [];
        // @opc-feature: channel-model-fetch-fallback [end]
    } catch (error) {
        throw new Error(readAxiosError(error, "读取模型失败"));
    }
}

export type ChannelModelFetchResult = { models: string[]; catalog: ChannelModelCatalogItem[] };

export async function fetchChannelModels(channel: ModelChannel, viaBackend = false): Promise<ChannelModelFetchResult> {
    // 严格遵循 AGENTS.md 9.1：本地/私网渠道严禁发往云端后端 /ai/models，必须由前端/桌面端直连拉取
    if (!viaBackend || isLocalOrPrivateUpstream(channel.baseUrl)) {
        const models = await fetchImageModels({ baseUrl: channel.baseUrl, apiKey: channel.apiKey, apiFormat: channel.apiFormat, headers: channel.headers });
        return { models, catalog: models.map((id) => ({ id })) };
    }
    try {
        // 登录态由同源后端代取模型目录，避免每个 OpenAI 兼容服务分别维护浏览器 CORS 白名单。
        const result = await http.post<{ models?: Array<string | ChannelModelCatalogItem> }>("/ai/models", {
            baseUrl: channel.baseUrl,
            apiKey: channel.apiKey,
            apiFormat: channel.apiFormat,
            headers: channel.headers,
        });
        const catalog = new Map<string, ChannelModelCatalogItem>();
        for (const item of result.models || []) {
            const entry = typeof item === "string" ? sanitizeChannelModelCatalogItem({ id: item }) : sanitizeChannelModelCatalogItem(item);
            if (!entry) continue;
            const existing = catalog.get(entry.id);
            catalog.set(entry.id, existing || entry);
        }
        const models = Array.from(catalog.keys()).sort((a, b) => a.localeCompare(b));
        const sortedCatalog = Array.from(catalog.values()).sort((a, b) => a.id.localeCompare(b.id));
        return { models, catalog: sortedCatalog };
    } catch (error) {
        throw new Error(readAxiosError(error, "读取模型失败"));
    }
}
