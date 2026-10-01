import { describe, expect, it } from "bun:test";
import { isSeedanceVideoConfig, isSeedanceVideoInterface } from "@/lib/seedance-video";
import { isSeedanceCompatibleVideoProtocol } from "@/lib/model-protocols";
import { isSeedanceConfig } from "@/services/api/video-provider-seedance";
import type { AiConfig } from "@/stores/use-config-store";

describe("Seedance Protocol Alias Routing Guardrail", () => {
    it("recognizes seedance-videos-compatible interface protocol directly", () => {
        expect(isSeedanceVideoInterface("seedance-videos-compatible")).toBe(true);
        expect(isSeedanceVideoInterface("seedance-video")).toBe(true);
        expect(isSeedanceVideoInterface("doubao-seedance-video")).toBe(true);
        expect(isSeedanceVideoInterface("openai-video")).toBe(false);
    });

    it("recognizes protocol via isSeedanceCompatibleVideoProtocol helper", () => {
        expect(isSeedanceCompatibleVideoProtocol("seedance-videos-compatible")).toBe(true);
        expect(isSeedanceCompatibleVideoProtocol("lxmone-seedance-videos")).toBe(true);
        expect(isSeedanceCompatibleVideoProtocol("chat-completion")).toBe(false);
    });

    it("correctly identifies alias model newtoken-36-video-ultra-mini through interfaceType", () => {
        const aliasConfig: Partial<AiConfig> = {
            model: "newtoken-36-video-ultra-mini",
            videoModel: "newtoken-36-video-ultra-mini",
            baseUrl: "https://www.newtoken.club/v1",
        };
        const resolvedConfig = {
            ...aliasConfig,
            interfaceType: "seedance-videos-compatible",
        } as any;

        expect(isSeedanceVideoConfig(resolvedConfig)).toBe(true);
        expect(isSeedanceConfig(resolvedConfig)).toBe(true);
    });

    it("does not misroute volcengine-ark-image with agent plan", () => {
        const imageConfig = {
            model: "doubao-seedream-4-0",
            interfaceType: "volcengine-ark-image",
            baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
        } as any;
        expect(isSeedanceVideoConfig(imageConfig)).toBe(false);
    });
});
