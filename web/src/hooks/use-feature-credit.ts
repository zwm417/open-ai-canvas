// @opc-feature: feature-credits [start]
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useUserStore } from "@/stores/use-user-store";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import {
    getPublicFeatureCredits,
    deductFeatureCredits,
    refundFeatureCredits,
    resolveFeatureConfig,
    getSceneAliases,
    type FeatureCreditItem,
    type DeductFeatureCreditsResult,
} from "@/services/api/feature-credits";

const FEATURE_CREDITS_QUERY_KEY = ["public-feature-credits"] as const;

export function useFeatureCredit(scene: string, selectedModel?: string) {
    const user = useUserStore((state) => state.user);
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const { availableMicrocredits, refresh: refreshWallet } = useWalletBalance(user?.id, creditsEnabled);

    const { data: settings, refetch: refetchSettings } = useQuery({
        queryKey: FEATURE_CREDITS_QUERY_KEY,
        queryFn: getPublicFeatureCredits,
        staleTime: 60_000,
        refetchOnWindowFocus: false,
    });

    const featureConfig: FeatureCreditItem | undefined = useMemo(() => {
        return resolveFeatureConfig(settings, scene);
    }, [settings, scene]);

    // 原系统保底机制：仅当系统显式配置了该场景且管理员主动关闭时为免收；未配置场景必须走保底计费，决不免收
    const isExplicitlyDisabled = featureConfig !== undefined && !featureConfig.enabled;
    const isEnabled = Boolean(creditsEnabled && !isExplicitlyDisabled);

    // 若未显式配置，保底走大模型 Token 代理计费模式
    const isTokenMultiplier = featureConfig ? featureConfig.mode === "token_multiplier" : true;

    const effectiveBps = useMemo(() => {
        const targetModel = selectedModel?.trim();
        const aliases = getSceneAliases(scene);
        if (targetModel && settings?.modelSceneMultipliers) {
            const clean = targetModel.replace(/^models\//, "");
            for (const alias of aliases) {
                const override = settings.modelSceneMultipliers[clean]?.[alias]
                    ?? settings.modelSceneMultipliers[targetModel]?.[alias];
                if (override && override > 0) {
                    return override;
                }
            }
        }
        if (featureConfig && featureConfig.multiplierBasisPoints && featureConfig.multiplierBasisPoints > 0) {
            return featureConfig.multiplierBasisPoints;
        }
        return 10_000;
    }, [featureConfig, selectedModel, settings, scene]);

    const costMicrocredits = useMemo(() => {
        if (!isEnabled || isTokenMultiplier) return 0;
        if (featureConfig) {
            return featureConfig.fixedMicrocredits || 0;
        }
        // 未配置且非 token_multiplier 时保底 1 积分 (1,000,000 微积分)
        return 1_000_000;
    }, [isEnabled, featureConfig, isTokenMultiplier]);

    const costCredits = costMicrocredits / 1_000_000;
    const hasSufficientBalance = isTokenMultiplier
        ? (availableMicrocredits ?? 0) > 0
        : (availableMicrocredits ?? 0) >= costMicrocredits;

    const formattedCost = useMemo(() => {
        if (!isEnabled) return "未启用计费";
        if (isTokenMultiplier) {
            const multiplier = (effectiveBps / 10_000).toFixed(1).replace(/\.0$/, "");
            return `按 Token × ${multiplier}倍`;
        }
        if (costMicrocredits <= 0) return "免费";
        return `${costCredits} 积分`;
    }, [isEnabled, isTokenMultiplier, effectiveBps, costMicrocredits, costCredits]);

    const deduct = async (modelOverride?: string, note?: string, referenceKey?: string, customAmount?: number): Promise<DeductFeatureCreditsResult> => {
        if (!isEnabled) {
            return { charged: false, deductedMicrocredits: 0 };
        }
        const targetAmount = typeof customAmount === "number" && customAmount > 0 ? customAmount : costMicrocredits;
        const requiredCredits = targetAmount / 1_000_000;
        if ((availableMicrocredits ?? 0) < targetAmount) {
            if (isTokenMultiplier) {
                throw new Error("当前积分余额不足，请先充值或签到领取积分后再执行此功能");
            }
            throw new Error(`当前积分余额不足（需 ${requiredCredits} 积分，当前剩余 ${(availableMicrocredits ?? 0) / 1_000_000} 积分），请先充值或签到`);
        }
        if (isTokenMultiplier || targetAmount <= 0) {
            return { charged: false, deductedMicrocredits: 0 };
        }
        const res = await deductFeatureCredits({
            scene,
            model: modelOverride || selectedModel || featureConfig?.defaultModel,
            amountMicrocredits: targetAmount,
            note,
            referenceKey,
        });
        refreshWallet();
        return res;
    };

    const refund = async (
        amount: number,
        modelOverride?: string,
        note?: string,
        referenceKey?: string,
        originalReferenceKey?: string,
        originalDeductionId?: string,
    ) => {
        if (!amount || amount <= 0) return;
        await refundFeatureCredits({
            amountMicrocredits: amount,
            scene,
            model: modelOverride || selectedModel || featureConfig?.defaultModel,
            note,
            referenceKey,
            originalReferenceKey,
            originalDeductionId,
        });
        refreshWallet();
    };

    return {
        isEnabled,
        isTokenMultiplier,
        effectiveBps,
        featureConfig,
        costMicrocredits,
        costCredits,
        formattedCost,
        availableMicrocredits: availableMicrocredits ?? 0,
        hasSufficientBalance,
        deduct,
        refund,
        refetchSettings,
    };
}
// @opc-feature: feature-credits [end]
