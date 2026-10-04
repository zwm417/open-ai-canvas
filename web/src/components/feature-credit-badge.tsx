// @opc-feature: feature-credits [start]
import { Coins, AlertCircle } from "lucide-react";
import { Tooltip } from "antd";

import { useFeatureCredit } from "@/hooks/use-feature-credit";
import { cn } from "@/lib/utils";

type FeatureCreditBadgeProps = {
    scene: string;
    model?: string;
    className?: string;
    size?: "small" | "normal";
};

export function FeatureCreditBadge({
    scene,
    model,
    className,
    size = "normal",
}: FeatureCreditBadgeProps) {
    const { isEnabled, formattedCost, costCredits, hasSufficientBalance, costMicrocredits, featureConfig } = useFeatureCredit(scene, model);

    const isMultiplier = featureConfig?.mode === "token_multiplier";

    if (!isEnabled || (!isMultiplier && costMicrocredits <= 0)) {
        return null;
    }

    const isSmall = size === "small";

    if (!hasSufficientBalance) {
        return (
            <Tooltip title={isMultiplier ? "当前积分余额不足，请先在右上角钱包充值或签到" : `积分余额不足！需要 ${costCredits} 积分，请先在右上角钱包充值或签到`}>
                <span
                    className={cn(
                        "inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 text-red-700 font-medium dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 transition-colors",
                        isSmall ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
                        className,
                    )}
                >
                    <AlertCircle className={isSmall ? "size-2.5" : "size-3 text-red-500"} />
                    <span>消耗 {formattedCost}（不足）</span>
                </span>
            </Tooltip>
        );
    }

    return (
        <Tooltip title={isMultiplier ? `按实际 Token 消耗与场景倍率结算（${formattedCost}），生成时自动扣除` : `执行该功能将扣减 ${costCredits} 积分，失败将自动退款`}>
            <span
                className={cn(
                    "inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-50/80 text-amber-800 font-medium dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300 shadow-sm transition-colors",
                    isSmall ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
                    className,
                )}
            >
                <Coins className={isSmall ? "size-2.5 text-amber-500" : "size-3 text-amber-500"} />
                <span>消耗 {formattedCost}</span>
            </span>
        </Tooltip>
    );
}
// @opc-feature: feature-credits [end]
