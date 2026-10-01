// @opc-feature: feature-credits [start]
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useUserStore } from "@/stores/use-user-store";
import { useWalletBalance } from "@/hooks/use-wallet-balance";
import {
    getPublicFeatureCredits,
    deductFeatureCredits,
    refundFeatureCredits,
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
        return settings?.features?.[scene];
    }, [settings, scene]);

    const isEnabled = Boolean(creditsEnabled && featureConfig?.enabled);

    const costMicrocredits = useMemo(() => {
        if (!isEnabled || !featureConfig) return 0;
        return featureConfig.fixedMicrocredits || 0;
    }, [isEnabled, featureConfig]);

    const costCredits = costMicrocredits / 1_000_000;
    const hasSufficientBalance = (availableMicrocredits ?? 0) >= costMicrocredits;

    const formattedCost = useMemo(() => {
        if (!isEnabled || costMicrocredits <= 0) return "免费";
        return `${costCredits} 积分`;
    }, [isEnabled, costMicrocredits, costCredits]);

    const deduct = async (modelOverride?: string, note?: string): Promise<DeductFeatureCreditsResult> => {
        if (!isEnabled || costMicrocredits <= 0) {
            return { charged: false, deductedMicrocredits: 0 };
        }
        if (!hasSufficientBalance) {
            throw new Error(`当前积分余额不足（需 ${costCredits} 积分，当前剩余 ${(availableMicrocredits ?? 0) / 1_000_000} 积分），请先充值或签到`);
        }
        const res = await deductFeatureCredits({
            scene,
            model: modelOverride || selectedModel || featureConfig?.defaultModel,
            amountMicrocredits: costMicrocredits,
            note,
        });
        refreshWallet();
        return res;
    };

    const refund = async (amount: number, modelOverride?: string, note?: string) => {
        if (!amount || amount <= 0) return;
        await refundFeatureCredits({
            amountMicrocredits: amount,
            scene,
            model: modelOverride || selectedModel || featureConfig?.defaultModel,
            note,
        });
        refreshWallet();
    };

    return {
        isEnabled,
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
