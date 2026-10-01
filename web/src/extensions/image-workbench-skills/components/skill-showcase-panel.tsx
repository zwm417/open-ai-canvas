import React, { useState, useEffect } from "react";
import { Bookmark, Sparkles } from "lucide-react";
import type { WorkbenchSkill } from "../types/skill-contract";
import { SkillBadgeIcon } from "./skill-icons";

interface SkillShowcasePanelProps {
    skill: WorkbenchSkill;
    resultsContent?: React.ReactNode;
    hasResults?: boolean;
}

function SkillShowcaseImage({
    src,
    alt,
    title,
    subtitle,
    badgeIcon,
}: {
    src?: string;
    alt?: string;
    title?: string;
    subtitle?: string;
    badgeIcon?: string;
}) {
    const [hasError, setHasError] = useState(false);
    useEffect(() => {
        setHasError(false);
    }, [src]);

    if (!src || hasError) {
        return (
            <div className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center text-stone-400">
                <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-stone-200 text-stone-500 shadow-inner dark:bg-stone-800 dark:text-stone-400">
                    <SkillBadgeIcon type={badgeIcon} className="size-8" />
                </div>
                <h3 className="text-base font-semibold text-stone-700 dark:text-stone-300">{title || alt}</h3>
                <p className="mt-1.5 max-w-md text-xs text-stone-400 dark:text-stone-500">
                    {subtitle || "上传素材并输入补充描述后，即可生成商业级视觉效果"}
                </p>
            </div>
        );
    }

    return (
        <img
            src={src}
            alt={alt}
            className="h-auto w-full object-contain"
            onError={() => setHasError(true)}
        />
    );
}

export const SkillShowcasePanel: React.FC<SkillShowcasePanelProps> = ({
    skill,
    resultsContent,
    hasResults = false,
}) => {
    const [activeTab, setActiveTab] = useState<"showcase" | "favorites" | "results">(
        hasResults ? "results" : "showcase"
    );

    // 当有新生成结果或开始生成时，自动切到结果选项卡
    useEffect(() => {
        if (hasResults) {
            setActiveTab("results");
        }
    }, [hasResults]);

    // 当切换技能时，默认展示新技能的效果示例
    useEffect(() => {
        if (skill?.id) {
            setActiveTab("showcase");
        }
    }, [skill?.id]);

    return (
        <div className="flex h-full flex-col">
            {/* 顶部选项卡：参考示例 / 收藏 / (若有结果则显示) 生成结果 */}
            <div className="flex items-center gap-6 border-b border-black/[0.06] pb-3 dark:border-white/[0.06]">
                <button
                    type="button"
                    onClick={() => setActiveTab("showcase")}
                    className={`relative pb-1 text-sm font-semibold transition-colors ${
                        activeTab === "showcase"
                            ? "text-stone-900 dark:text-stone-100"
                            : "text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
                    }`}
                >
                    <span>参考示例</span>
                    {activeTab === "showcase" && (
                        <span className="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-stone-900 dark:bg-stone-100" />
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab("favorites")}
                    className={`relative pb-1 text-sm font-semibold transition-colors ${
                        activeTab === "favorites"
                            ? "text-stone-900 dark:text-stone-100"
                            : "text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
                    }`}
                >
                    <span>收藏</span>
                    {activeTab === "favorites" && (
                        <span className="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-stone-900 dark:bg-stone-100" />
                    )}
                </button>

                {hasResults && (
                    <button
                        type="button"
                        onClick={() => setActiveTab("results")}
                        className={`relative pb-1 text-sm font-semibold transition-colors flex items-center gap-1.5 ${
                            activeTab === "results"
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
                        }`}
                    >
                        <Sparkles className="size-3.5" />
                        <span>生成结果</span>
                        {activeTab === "results" && (
                            <span className="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-amber-500 dark:bg-amber-400" />
                        )}
                    </button>
                )}
            </div>

            {/* 选项卡内容 */}
            <div className="flex-1 overflow-y-auto thin-scrollbar pt-6">
                {activeTab === "showcase" && (
                    <div className="flex flex-col items-center justify-center">
                        {/* 标题与副标题 */}
                        <div className="mb-6 text-center">
                            <h2 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
                                {skill.showcaseTitle || `${skill.name}效果示例`}
                            </h2>
                            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                                {skill.showcaseSubtitle || skill.subtitle}
                            </p>
                        </div>

                        {/* 效果展示大图 */}
                        <div className="relative max-h-[640px] w-full max-w-4xl overflow-hidden rounded-3xl border border-black/[0.06] bg-stone-100 shadow-sm dark:border-white/[0.08] dark:bg-[#252528]">
                            <SkillShowcaseImage
                                src={skill.showcaseImageUrl}
                                alt={skill.showcaseTitle}
                                title={skill.showcaseTitle || `${skill.name}效果示例`}
                                subtitle={skill.showcaseSubtitle || skill.subtitle}
                                badgeIcon={skill.badgeIcon}
                            />
                        </div>
                    </div>
                )}

                {activeTab === "favorites" && (
                    <div className="flex min-h-[360px] flex-col items-center justify-center text-center text-stone-400">
                        <Bookmark className="size-10 stroke-1 mb-2 text-stone-300 dark:text-stone-600" />
                        <p className="text-sm">暂无收藏的效果示例</p>
                        <p className="text-xs text-stone-400 mt-1">在生成满意的图片后，可点击收藏沉淀为专属示例</p>
                    </div>
                )}

                {activeTab === "results" && (
                    <div className="min-h-full">
                        {resultsContent}
                    </div>
                )}
            </div>
        </div>
    );
};
