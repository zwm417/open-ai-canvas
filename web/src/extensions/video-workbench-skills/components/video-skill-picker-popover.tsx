import React, { useState, useEffect, useRef } from "react";
import { Check, Search, X, Clapperboard } from "lucide-react";
import { Input, type InputRef } from "antd";
import type { VideoSkillCategory, VideoWorkbenchSkill } from "../types/video-skill-contract";
import { BUILTIN_VIDEO_CATEGORIES, getVideoSkillsByCategory } from "../catalog/builtin-video-skills";

interface VideoSkillPickerPopoverProps {
    open: boolean;
    onClose: () => void;
    activeSkillId: string | null;
    onSelectSkill: (skillId: string | null) => void;
}

export const VideoSkillPickerPopover: React.FC<VideoSkillPickerPopoverProps> = ({
    open,
    onClose,
    activeSkillId,
    onSelectSkill,
}) => {
    const [activeTab, setActiveTab] = useState<string>("recommend");
    const [searchKeyword, setSearchKeyword] = useState<string>("");
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) {
            setSearchKeyword("");
        }
    }, [open]);

    // 遵循 AGENTS.md 5.1 规范：Esc 键退出与点击外部关闭
    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                onClose();
            }
        };
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Element | null;
            if (target?.closest?.("[data-video-skill-picker-trigger]")) {
                return;
            }
            if (containerRef.current && !containerRef.current.contains(target as Node)) {
                onClose();
            }
        };
        window.addEventListener("keydown", handleKeyDown, true);
        document.addEventListener("pointerdown", handlePointerDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
            document.removeEventListener("pointerdown", handlePointerDown);
        };
    }, [open, onClose]);

    if (!open) return null;

    const displayedSkills = getVideoSkillsByCategory(activeTab, searchKeyword);

    return (
        <div
            ref={containerRef}
            className="absolute left-0 right-0 top-full mt-2 z-40 w-full overflow-hidden rounded-2xl border border-black/[0.08] bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 dark:border-white/[0.08] dark:bg-[#1c1c1e]"
        >
            <div className="flex flex-col">
                {/* 顶部标题与清除选择 */}
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-bold text-stone-950 dark:text-stone-50">你想创作什么？</h2>
                        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">让每一个想法，都能成为影像</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                onSelectSkill(null);
                                onClose();
                            }}
                            className="text-xs font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors cursor-pointer"
                        >
                            清除选择
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex size-7 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-[#2c2c2e] dark:hover:text-stone-200 transition-colors cursor-pointer"
                            aria-label="关闭"
                        >
                            <X className="size-4" />
                        </button>
                    </div>
                </div>

                {/* 分类 Tabs 与搜索 */}
                <div className="mt-4 flex items-center justify-between gap-3 border-b border-black/[0.06] pb-2 dark:border-white/[0.06]">
                    <div className="flex items-center gap-1 overflow-x-auto thin-scrollbar">
                        {BUILTIN_VIDEO_CATEGORIES.map((category) => {
                            const isActive = activeTab === category.id;
                            return (
                                <button
                                    key={category.id}
                                    type="button"
                                    onClick={() => setActiveTab(category.id)}
                                    className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                                        isActive
                                            ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30"
                                            : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-stone-50 dark:hover:bg-[#252528]"
                                    }`}
                                >
                                    {category.name}
                                </button>
                            );
                        })}
                    </div>

                    <div className="relative w-36 shrink-0">
                        <Input
                            size="small"
                            value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            placeholder="搜一搜"
                            prefix={<Search className="size-3 text-stone-400" />}
                            className="!rounded-lg !text-xs !bg-stone-50 dark:!bg-[#252528] !border-transparent hover:!border-stone-200 dark:hover:!border-stone-700"
                            allowClear
                        />
                    </div>
                </div>

                {/* 工作流卡片网格列表 */}
                <div className="mt-4 grid grid-cols-2 gap-3 max-h-[380px] overflow-y-auto thin-scrollbar pr-1">
                    {displayedSkills.map((skill) => {
                        const isSelected = activeSkillId === skill.id;
                        return (
                            <button
                                key={skill.id}
                                type="button"
                                onClick={() => {
                                    onSelectSkill(skill.id);
                                    onClose();
                                }}
                                className={`group relative flex items-center gap-3 rounded-xl border p-3 text-left transition-all cursor-pointer ${
                                    isSelected
                                        ? "border-blue-500 bg-blue-50/40 shadow-xs dark:border-blue-400 dark:bg-blue-950/20"
                                        : "border-black/[0.06] bg-white hover:border-black/20 hover:bg-stone-50/50 dark:border-white/[0.08] dark:bg-[#202022] dark:hover:border-white/20 dark:hover:bg-[#28282b]"
                                }`}
                            >
                                <div className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-black/[0.06] bg-stone-100 dark:border-white/[0.08] dark:bg-[#2c2c2e]">
                                    {skill.avatarUrl ? (
                                        <img src={skill.avatarUrl} alt={skill.name} className="size-full object-cover" />
                                    ) : (
                                        <div className="flex size-full items-center justify-center text-amber-500">
                                            <Clapperboard className="size-5" />
                                        </div>
                                    )}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1">
                                        <span className="truncate text-xs font-bold text-stone-900 dark:text-stone-100">
                                            {skill.name}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 truncate text-[11px] text-stone-500 dark:text-stone-400">
                                        {skill.subtitle}
                                    </p>
                                </div>

                                {isSelected && (
                                    <div className="absolute right-2.5 top-2.5 flex size-4 items-center justify-center rounded-full bg-blue-500 text-white shadow-2xs dark:bg-blue-400 dark:text-white">
                                        <Check className="size-2.5 stroke-[3]" />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="mt-4 text-center">
                    <span className="text-[11px] text-stone-400 dark:text-stone-500">更多技能持续上线中</span>
                </div>
            </div>
        </div>
    );
};
