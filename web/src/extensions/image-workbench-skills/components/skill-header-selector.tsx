import React from "react";
import { ChevronDown, Plus, Sparkles } from "lucide-react";
import { Button } from "antd";
import type { WorkbenchSkill } from "../types/skill-contract";
import { SkillBadgeIcon } from "./skill-icons";

interface SkillHeaderSelectorProps {
    skill: WorkbenchSkill | null;
    onOpenPicker: () => void;
    onNewSession: () => void;
}

export const SkillHeaderSelector: React.FC<SkillHeaderSelectorProps> = ({
    skill,
    onOpenPicker,
    onNewSession,
}) => {
    if (!skill) {
        return (
            <div className="flex items-center justify-between gap-3">
                <button
                    type="button"
                    data-skill-picker-trigger="true"
                    onClick={onOpenPicker}
                    className="group flex items-center gap-3.5 rounded-2xl border border-black/[0.08] bg-stone-50/90 px-4 py-2.5 text-left transition-all hover:border-amber-500/50 hover:bg-stone-100 dark:border-white/[0.08] dark:bg-[#252528] dark:hover:bg-[#2c2c2e] cursor-pointer"
                >
                    <div className="flex size-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400 shrink-0">
                        <Sparkles className="size-5.5" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-base font-bold text-stone-900 dark:text-stone-100">
                            <span>通用生图</span>
                            <ChevronDown className="size-4 text-stone-400 transition-transform group-hover:translate-y-0.5" />
                        </div>
                        <p className="truncate text-xs text-stone-500 dark:text-stone-400">点击选择专业视觉技能或场景</p>
                    </div>
                </button>

                <Button
                    type="text"
                    size="middle"
                    icon={<Plus className="size-4" />}
                    onClick={onNewSession}
                    className="!text-stone-600 dark:!text-stone-400 hover:!text-stone-900 dark:hover:!text-stone-100 font-medium"
                >
                    新建
                </Button>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-between gap-3">
            <button
                type="button"
                data-skill-picker-trigger="true"
                onClick={onOpenPicker}
                className="group flex flex-1 min-w-0 items-center gap-3.5 rounded-2xl border border-transparent px-2.5 py-1.5 text-left transition-all hover:bg-stone-100 dark:hover:bg-[#252528] cursor-pointer"
            >
                <div className="relative size-12 shrink-0 overflow-hidden rounded-xl border border-black/[0.06] bg-stone-100 dark:border-white/[0.08] dark:bg-[#2c2c2e] shadow-2xs">
                    {skill.avatarUrl ? (
                        <img src={skill.avatarUrl} alt={skill.name} className="size-full object-cover" />
                    ) : (
                        <div className="flex size-full items-center justify-center text-stone-600 dark:text-stone-300">
                            <SkillBadgeIcon type={skill.badgeIcon} className="size-6" />
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className="truncate text-base sm:text-lg font-bold text-stone-950 dark:text-stone-50">
                            {skill.name}
                        </span>
                        <ChevronDown className="size-4 shrink-0 text-stone-400 transition-transform group-hover:translate-y-0.5" />
                    </div>
                    <p className="truncate text-xs sm:text-sm text-stone-500 dark:text-stone-400">
                        {skill.subtitle || skill.description}
                    </p>
                </div>
            </button>

            <Button
                type="text"
                size="middle"
                icon={<Plus className="size-4" />}
                onClick={(e) => {
                    e.stopPropagation();
                    onNewSession();
                }}
                className="shrink-0 !text-stone-600 dark:!text-stone-400 hover:!text-stone-900 dark:hover:!text-stone-100 font-medium"
            >
                新建
            </Button>
        </div>
    );
};
