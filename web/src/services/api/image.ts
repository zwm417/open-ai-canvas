import { resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import { dataUrlToFile } from "@/lib/image-utils";
import { buildImageReferencePromptText } from "@/lib/image-reference-prompt";
// @opc-feature: upstream-image-adaptation [start]
import { imageToDataUrl, resolveUpstreamImageReference } from "@/services/image-storage";
// @opc-feature: upstream-image-adaptation [end]
import type { ReferenceImage } from "@/types/image";
import { withOpenAIPromptCacheKey } from "@/lib/openai-prompt-cache";
import { modelCapabilityConfigFor, normalizeImageValue } from "@/lib/model-capabilities";
import { buildGeminiImageGenerationConfig, parseGeminiImageDataUrl, type GeminiImageGenerationConfig } from "@/lib/gemini-image";
import { isVolcengineArkImageProtocol } from "@/lib/model-protocols";
import { aiApiUrl, aiHeaders, imageChannelTransport, postChannelJSON, postGeminiJSON, postVolcengineArkImage } from "@/services/api/image-transport";

const IMAGE_OUTPUT_FORMAT = "png";
import type { AiTextMessage, GeminiPart, ImageApiResponse, RequestOptions, ResponseApiPayload, ResponseFunctionTool, ResponseInputMessage, ToolChoice, ToolResponseResult } from "@/services/api/image-contracts";
import { normalizeGrokImageResolution, normalizeQuality, normalizeVolcengineArkImageSize, resolveImageRequestSize, validateImageCapability } from "@/services/api/image-validation";
import { parseGeminiImagePayload, parseImagePayload, readAxiosError } from "@/services/api/image-response";
import { toChatCompletionMessages, toChatCompletionToolChoice, toClaudeBody, toGeminiBody, toGeminiToolOptions, toResponseInput, toResponseTool, withSystemMessage } from "@/services/api/image-protocols";
import { requestGeminiStreamingResponse, requestStreamingChatCompletion, requestStreamingClaude, requestStreamingResponse } from "@/services/api/image-streaming";
export { buildBackendToolRequests } from "@/services/api/image-protocols";
export type { AiTextContentPart, AiTextMessage, ResponseFunctionTool, ResponseInputMessage, ResponseToolCall, ToolChoice, ToolResponseResult } from "@/services/api/image-contracts";

function withSystemPrompt(config: AiConfig, prompt: string) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

function isToolChoiceCompatibilityError(error: unknown) {
    const message = error instanceof Error ? error.message : "";
    return /tool[_\s-]?choice|thinking\s+mode/i.test(message);
}

async function requestGeminiImages(config: AiConfig, prompt: string, references: ReferenceImage[], count: number, generationConfig: GeminiImageGenerationConfig, options?: RequestOptions) {
    // 参考图先完整读取并校验一次，再复用已解析的 inlineData；不能让每个输出重新读取 storageKey，
    // 否则资源缓存瞬时未命中时会出现“偶发缺参考图”或把 storageKey 当 URL 请求的问题。
    const referenceParts = await Promise.all(
        references.map(async (image) => {
            const dataUrl = await resolveUpstreamImageReference(image, config, { requirement: "require-base64" });
            const inlineData = parseGeminiImageDataUrl(dataUrl);
            return { inlineData };
        }),
    );
    const requests = Array.from({ length: count }, () => requestGeminiImagesOnce(config, prompt, referenceParts, generationConfig, options));
    return (await Promise.all(requests)).flat();
}

async function requestGeminiImagesOnce(config: AiConfig, prompt: string, referenceParts: GeminiPart[], generationConfig: GeminiImageGenerationConfig, options?: RequestOptions) {
    const parts: GeminiPart[] = [{ text: prompt }, ...referenceParts];
    const response = await postGeminiJSON(
        config,
        {
            ...toGeminiBody(config, [{ role: "user", content: prompt }], { generationConfig }),
            contents: [{ role: "user", parts }],
        },
        options,
    );
    return parseGeminiImagePayload(response);
}

export async function requestGeneration(config: AiConfig, prompt: string, options?: RequestOptions) {
    const selectedModel = config.model || config.imageModel;
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    const imageProfile = modelCapabilityConfigFor(config, selectedModel).image!;
    validateImageCapability(imageProfile, []);
    const normalizedImage = normalizeImageValue(imageProfile, config);
    const n = Number(normalizedImage.count);
    if (requestConfig.interfaceType === "gemini-image") {
        try {
            return await requestGeminiImages(requestConfig, prompt, [], n, buildGeminiImageGenerationConfig(normalizedImage.size, normalizedImage.quality), options);
        } catch (error) {
            throw new Error(readAxiosError(error, "请求失败"));
        }
    }
    if (requestConfig.interfaceType === "grok-image") {
        try {
            const size = normalizedImage.size && normalizedImage.size !== "auto" ? normalizedImage.size : undefined;
            const aspectRatio = size?.includes(":") ? size : undefined;
            const resolution = normalizeGrokImageResolution(normalizedImage.quality);
            const responseData = await postChannelJSON<ImageApiResponse>(
                requestConfig,
                aiApiUrl(requestConfig, "/images/generations"),
                {
                    model: requestConfig.model,
                    prompt: withSystemPrompt(requestConfig, prompt),
                    n,
                    response_format: "url",
                    ...(size ? { size } : {}),
                    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
                    ...(resolution ? { resolution } : {}),
                },
                options,
            );
            return parseImagePayload(responseData);
        } catch (error) {
            throw new Error(readAxiosError(error, "Grok 图片生成失败"));
        }
    }
    const quality = imageProfile.quality.supported && normalizedImage.quality !== "auto" ? normalizeQuality(normalizedImage.quality) || normalizedImage.quality : undefined;
    const requestSize = resolveImageRequestSize(imageProfile, quality, normalizedImage.size);
    const isVolcengineArk = isVolcengineArkImageProtocol(requestConfig.interfaceType);
    const normalizedRequestSize = requestSize?.parameter === "size" && isVolcengineArk ? { ...requestSize, value: normalizeVolcengineArkImageSize(requestSize.value)! } : requestSize;
    try {
        const payload = isVolcengineArk
            ? {
                  model: requestConfig.model,
                  prompt: withSystemPrompt(requestConfig, prompt),
                  n,
                  response_format: "b64_json",
                  watermark: false,
                  ...(normalizedRequestSize ? { [normalizedRequestSize.parameter]: normalizedRequestSize.value } : {}),
              }
            : {
                  model: requestConfig.model,
                  prompt: withSystemPrompt(requestConfig, prompt),
                  n,
                  ...(quality ? { quality } : {}),
                  ...(requestSize ? { [requestSize.parameter]: requestSize.value } : {}),
                  ...(imageProfile.responseFormat.supported ? { response_format: "b64_json" } : {}),
                  ...(imageProfile.outputFormat.supported ? { output_format: IMAGE_OUTPUT_FORMAT } : {}),
                  ...(imageProfile.transparentBackground.supported && normalizedImage.transparentBackground === "true" ? { background: "transparent" } : {}),
              };
        const responseData = isVolcengineArk ? await postVolcengineArkImage(requestConfig, payload, options) : await postChannelJSON<ImageApiResponse>(requestConfig, aiApiUrl(requestConfig, "/images/generations"), payload, options);
        const images = parseImagePayload(responseData);
        return images;
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

// @opc-feature: upstream-image-adaptation [start]
async function grokImageInputURL(image: ReferenceImage, config?: AiConfig) {
    return resolveUpstreamImageReference(image, config);
}
// @opc-feature: upstream-image-adaptation [end]

export async function requestEdit(config: AiConfig, prompt: string, references: ReferenceImage[], mask?: ReferenceImage, options?: RequestOptions) {
    const selectedModel = config.model || config.imageModel;
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    const imageProfile = modelCapabilityConfigFor(config, selectedModel).image!;
    validateImageCapability(imageProfile, references, mask);
    const normalizedImage = normalizeImageValue(imageProfile, config);
    const n = Number(normalizedImage.count);
    const requestPrompt = buildImageReferencePromptText(prompt, references);
    if (requestConfig.interfaceType === "gemini-image") {
        if (mask) throw new Error("Gemini 调用格式暂不支持蒙版编辑");
        try {
            return await requestGeminiImages(requestConfig, requestPrompt, references, n, buildGeminiImageGenerationConfig(normalizedImage.size, normalizedImage.quality), options);
        } catch (error) {
            throw new Error(readAxiosError(error, "请求失败"));
        }
    }
    if (requestConfig.interfaceType === "grok-image") {
        if (mask) throw new Error("Grok 图片协议不支持蒙版编辑，请移除蒙版后重试");
        if (references.length !== 1) throw new Error("Grok 图片编辑必须提供且仅支持 1 张参考图");
        try {
            // @opc-feature: upstream-image-adaptation [start]
            const imageUrl = await resolveUpstreamImageReference(references[0], requestConfig, { targetModel: requestConfig.model });
            // @opc-feature: upstream-image-adaptation [end]
            const size = normalizedImage.size && normalizedImage.size !== "auto" ? normalizedImage.size : undefined;
            const aspectRatio = size?.includes(":") ? size : undefined;
            const resolution = normalizeGrokImageResolution(normalizedImage.quality);
            const response = await postChannelJSON<ImageApiResponse>(
                requestConfig,
                aiApiUrl(requestConfig, "/images/edits"),
                {
                    model: requestConfig.model,
                    prompt: withSystemPrompt(requestConfig, requestPrompt),
                    image: { url: imageUrl },
                    n,
                    response_format: "url",
                    ...(size ? { size } : {}),
                    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
                    ...(resolution ? { resolution } : {}),
                },
                options,
            );
            return parseImagePayload(response);
        } catch (error) {
            throw new Error(readAxiosError(error, "Grok 图片编辑失败"));
        }
    }
    if (isVolcengineArkImageProtocol(requestConfig.interfaceType)) {
        if (mask) throw new Error("火山方舟图片协议不支持蒙版编辑，请移除蒙版后重试");
        const quality = imageProfile.quality.supported && normalizedImage.quality !== "auto" ? normalizeQuality(normalizedImage.quality) || normalizedImage.quality : undefined;
        const sizeRequest = resolveImageRequestSize(imageProfile, quality, normalizedImage.size);
        const requestSize = sizeRequest?.parameter === "size" ? { ...sizeRequest, value: normalizeVolcengineArkImageSize(sizeRequest.value)! } : sizeRequest;
        try {
            // @opc-feature: upstream-image-adaptation [start]
            const images = await Promise.all(references.map((image) => resolveUpstreamImageReference(image, requestConfig, { requirement: "require-base64" })));
            // @opc-feature: upstream-image-adaptation [end]
            const response = await postVolcengineArkImage(
                requestConfig,
                {
                    model: requestConfig.model,
                    prompt: withSystemPrompt(requestConfig, requestPrompt),
                    n,
                    response_format: "b64_json",
                    watermark: false,
                    ...(requestSize ? { [requestSize.parameter]: requestSize.value } : {}),
                    ...(images.length === 1 ? { image: images[0] } : images.length > 1 ? { image: images } : {}),
                },
                options,
            );
            return parseImagePayload(response);
        } catch (error) {
            throw new Error(readAxiosError(error, "火山方舟图片生成失败"));
        }
    }
    const quality = imageProfile.quality.supported && normalizedImage.quality !== "auto" ? normalizeQuality(normalizedImage.quality) || normalizedImage.quality : undefined;
    const requestSize = resolveImageRequestSize(imageProfile, quality, normalizedImage.size);
    const formData = new FormData();
    formData.set("model", requestConfig.model);
    formData.set("prompt", withSystemPrompt(requestConfig, requestPrompt));
    formData.set("n", String(n));
    if (imageProfile.responseFormat.supported) formData.set("response_format", "b64_json");
    if (imageProfile.outputFormat.supported) formData.set("output_format", IMAGE_OUTPUT_FORMAT);
    if (imageProfile.transparentBackground.supported && normalizedImage.transparentBackground === "true") {
        formData.set("background", "transparent");
    }
    if (quality) {
        formData.set("quality", quality);
    }
    if (requestSize) {
        formData.set(requestSize.parameter, requestSize.value);
    }
    // @opc-feature: upstream-image-adaptation [start]
    const files = await Promise.all(references.map(async (image) => dataUrlToFile({ ...image, dataUrl: await resolveUpstreamImageReference(image, requestConfig, { requirement: "require-base64" }) })));
    files.forEach((file) => formData.append("image", file));
    if (mask) {
        const maskDataUrl = await resolveUpstreamImageReference(mask, requestConfig, { requirement: "require-base64", label: "蒙版图" });
        formData.set("mask", dataUrlToFile({ ...mask, dataUrl: maskDataUrl }));
    }
    // @opc-feature: upstream-image-adaptation [end]

    try {
        const images = parseImagePayload(await imageChannelTransport(requestConfig).postForm<ImageApiResponse>(aiApiUrl(requestConfig, "/images/edits"), formData, { signal: options?.signal, headers: aiHeaders(requestConfig) }));
        return images;
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

// @opc-feature: upstream-image-adaptation [start]
async function adaptMessagesImagesForUpstream<T extends ResponseInputMessage | AiTextMessage>(messages: T[], config: AiConfig): Promise<T[]> {
    return Promise.all(
        messages.map(async (msg) => {
            if (!("content" in msg) || !Array.isArray(msg.content)) return msg;
            const adaptedContent = await Promise.all(
                (msg.content as any[]).map(async (part) => {
                    if (part.type !== "image_url") return part;
                    const originalUrl = part.image_url?.url || "";
                    const adaptedUrl = await resolveUpstreamImageReference({ url: originalUrl }, config);
                    return {
                        ...part,
                        image_url: { ...part.image_url, url: adaptedUrl },
                    };
                })
            );
            return {
                ...msg,
                content: adaptedContent,
            } as T;
        })
    );
}
// @opc-feature: upstream-image-adaptation [end]

export async function requestImageQuestion(config: AiConfig, messages: AiTextMessage[], onDelta: (text: string) => void, options?: RequestOptions) {
    const requestConfig = resolveModelRequestConfig(config, config.model || config.textModel);
    // @opc-feature: upstream-image-adaptation [start]
    const effectiveMessages = await adaptMessagesImagesForUpstream(messages, requestConfig);
    // @opc-feature: upstream-image-adaptation [end]
    try {
        if (requestConfig.apiFormat === "gemini") {
            const answer = (await requestGeminiStreamingResponse(requestConfig, toGeminiBody(requestConfig, effectiveMessages), onDelta, options)).content || "没有返回内容";
            if (answer === "没有返回内容") onDelta(answer);
            return answer;
        }
        if (requestConfig.interfaceType === "claude-api") {
            const answer = (await requestStreamingClaude(requestConfig, toClaudeBody(requestConfig, effectiveMessages), onDelta, options)).content || "没有返回内容";
            if (answer === "没有返回内容") onDelta(answer);
            return answer;
        }
        if (requestConfig.interfaceType === "chat-completion" || !requestConfig.interfaceType) {
            const answer =
                (
                    await requestStreamingChatCompletion(
                        requestConfig,
                        {
                            model: requestConfig.model,
                            messages: toChatCompletionMessages(withSystemMessage(requestConfig, effectiveMessages)),
                            // @opc-feature: request-generation-options [start]
                            ...(typeof options?.temperature === "number" ? { temperature: options.temperature } : {}),
                            ...(typeof options?.presence_penalty === "number" ? { presence_penalty: options.presence_penalty } : {}),
                            ...(typeof (options as any)?.max_tokens === "number" ? { max_tokens: (options as any).max_tokens } : typeof (options as any)?.maxTokens === "number" ? { max_tokens: (options as any).maxTokens } : {}),
                            // @opc-feature: request-generation-options [end]
                        },
                        onDelta,
                        options,
                    )
                ).content || "没有返回内容";
            if (answer === "没有返回内容") onDelta(answer);
            return answer;
        }
        const answer =
            (
                await requestStreamingResponse(
                    requestConfig,
                    {
                        model: requestConfig.model,
                        input: toResponseInput(withSystemMessage(requestConfig, effectiveMessages)),
                        // @opc-feature: request-generation-options [start]
                        ...(typeof options?.temperature === "number" ? { temperature: options.temperature } : {}),
                        ...(typeof options?.presence_penalty === "number" ? { presence_penalty: options.presence_penalty } : {}),
                        ...(typeof (options as any)?.max_tokens === "number" ? { max_tokens: (options as any).max_tokens } : typeof (options as any)?.maxTokens === "number" ? { max_tokens: (options as any).maxTokens } : {}),
                        // @opc-feature: request-generation-options [end]
                    },
                    onDelta,
                    options,
                )
            ).content || "没有返回内容";
        if (answer === "没有返回内容") onDelta(answer);
        return answer;
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

export async function requestToolResponse(config: AiConfig, messages: ResponseInputMessage[], tools: ResponseFunctionTool[], toolChoice: ToolChoice = "auto", onDelta?: (text: string) => void, options?: RequestOptions): Promise<ToolResponseResult> {
    const requestConfig = resolveModelRequestConfig(config, config.model || config.textModel);
    // @opc-feature: upstream-image-adaptation [start]
    const effectiveMessages = await adaptMessagesImagesForUpstream(messages, requestConfig);
    // @opc-feature: upstream-image-adaptation [end]
    try {
        if (requestConfig.apiFormat === "gemini") {
            return await requestGeminiStreamingResponse(requestConfig, toGeminiBody(requestConfig, effectiveMessages, toGeminiToolOptions(tools, toolChoice)), onDelta, options);
        }
        if (requestConfig.interfaceType === "claude-api") return await requestStreamingClaude(requestConfig, toClaudeBody(requestConfig, effectiveMessages, tools), onDelta, options);
        if (requestConfig.interfaceType === "chat-completion" || !requestConfig.interfaceType) {
            const chatPayload: Record<string, unknown> = {
                model: requestConfig.model,
                messages: toChatCompletionMessages(withSystemMessage(requestConfig, effectiveMessages)),
                tools,
                tool_choice: toChatCompletionToolChoice(toolChoice),
                parallel_tool_calls: false,
            };
            try {
                return await requestStreamingChatCompletion(requestConfig, chatPayload, onDelta, options);
            } catch (error) {
                if (!isToolChoiceCompatibilityError(error)) throw error;

                // 部分 OpenAI 兼容上游仅支持 auto，思考模式则可能要求完全省略该字段。
                if (toolChoice !== "auto") {
                    try {
                        return await requestStreamingChatCompletion(requestConfig, { ...chatPayload, tool_choice: toChatCompletionToolChoice("auto") }, onDelta, options);
                    } catch (autoError) {
                        if (!isToolChoiceCompatibilityError(autoError)) throw autoError;
                    }
                }
                const { tool_choice: _ignored, ...withoutToolChoice } = chatPayload;
                void _ignored;
                return await requestStreamingChatCompletion(requestConfig, withoutToolChoice, onDelta, options);
            }
        }
        return await requestStreamingResponse(
            requestConfig,
            withOpenAIPromptCacheKey(
                {
                    model: requestConfig.model,
                    input: toResponseInput(withSystemMessage(requestConfig, effectiveMessages)),
                    tools: tools.map(toResponseTool),
                    tool_choice: toolChoice,
                    parallel_tool_calls: false,
                },
                options?.promptCacheKey,
            ),
            onDelta,
            options,
        );
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

export { fetchChannelModels, fetchImageModels } from "@/services/api/image-models";
export type { ChannelModelFetchResult } from "@/services/api/image-models";
