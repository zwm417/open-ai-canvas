import React, { useState, useEffect, useRef } from "react";
import { Check, Search, X } from "lucide-react";
import { Input, type InputRef } from "antd";
import type { SkillCategory, WorkbenchSkill } from "../types/skill-contract";
import { SkillBadgeIcon } from "./skill-icons";

interface SkillPickerPopoverProps {
    open: boolean;
    onClose: () => void;
    categories: SkillCategory[];
    activeSkillId: string | null;
    onSelectSkill: (skillId: string | null) => void;
    getSkillsByCategory: (categoryId: string, keyword?: string) => WorkbenchSkill[];
}

function SkillCardAvatar({ src, alt, badgeIcon }: { src?: string; alt: string; badgeIcon?: string }) {
    const [hasError, setHasError] = useState(false);
    useEffect(() => {
        setHasError(false);
    }, [src]);

    if (!src || hasError) {
        return (
            <div className="flex size-full items-center justify-center text-stone-600 dark:text-stone-300">
                <SkillBadgeIcon type={badgeIcon} className="size-5" />
            </div>
        );
    }
    return (
        <img
            src={src}
            alt={alt}
            className="size-full object-cover"
            onError={() => setHasError(true)}
        />
    );
}

export const SkillPickerPopover: React.FC<SkillPickerPopoverProps> = ({
    open,
    onClose,
    categories,
    activeSkillId,
    onSelectSkill,
    getSkillsByCategory,
}) => {
    const [activeTab, setActiveTab] = useState<string>("recommend");
    const [searchKeyword, setSearchKeyword] = useState<string>("");
    const searchInputRef = useRef<InputRef>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // 默认展示推荐分类或当前激活技能的所属分类
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
            if (target?.closest?.("[data-skill-picker-trigger]")) {
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

    const displayedSkills = getSkillsByCategory(activeTab, searchKeyword);

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
                        <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">让每一个想法，都能成为画面</p>
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
                        {categories.map((category) => {
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

                    <div className="w-36 shrink-0">
                        <Input
                            ref={searchInputRef}
                            size="small"
                            value={searchKeyword}
                            onChange={(e) => setSearchKeyword(e.target.value)}
                            placeholder="搜一搜"
                            prefix={<Search className="size-3.5 text-stone-400" />}
                            allowClear
                            className="!rounded-full !bg-stone-100 dark:!bg-[#2c2c2e] !border-transparent text-xs"
                        />
                    </div>
                </div>

                {/* 技能卡片列表（2列网格） */}
                <div className="mt-4 max-h-[380px] min-h-[220px] overflow-y-auto thin-scrollbar pr-1">
                    {displayedSkills.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2.5">
                            {displayedSkills.map((skill) => {
                                const isSelected = activeSkillId === skill.id;
                                return (
                                    <div
                                        key={skill.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => {
                                            onSelectSkill(skill.id);
                                            onClose();
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                onSelectSkill(skill.id);
                                                onClose();
                                            }
                                        }}
                                        className={`group relative flex items-center gap-3 rounded-2xl border p-3 text-left transition-all cursor-pointer select-none ${
                                            isSelected
                                                ? "border-stone-900 bg-stone-50/80 shadow-sm dark:border-stone-100 dark:bg-[#252528]"
                                                : "border-black/[0.06] bg-stone-50/40 hover:border-black/15 hover:bg-stone-50 dark:border-white/[0.06] dark:bg-[#252528]/50 dark:hover:border-white/15 dark:hover:bg-[#252528]"
                                        }`}
                                    >

                                        <div className="size-11 shrink-0 overflow-hidden rounded-xl border border-black/[0.06] bg-stone-100 dark:border-white/[0.08] dark:bg-[#2c2c2e]">
                                            <SkillCardAvatar src={skill.avatarUrl} alt={skill.name} badgeIcon={skill.badgeIcon} />
                                        </div>

                                        <div className="min-w-0 flex-1 pr-4">
                                            <div className="flex items-center gap-1.5 truncate text-xs font-semibold text-stone-900 dark:text-stone-100">
                                                <span className="truncate">{skill.name}</span>
                                                {skill.defaultCount && skill.defaultCount > 1 ? (
                                                    <span className="inline-flex shrink-0 items-center rounded-full bg-blue-50 px-1.5 py-0.2 text-[10px] font-medium text-blue-600 border border-blue-200/70 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40 leading-none">
                                                        {skill.defaultCount}张
                                                    </span>
                                                ) : null}
                                            </div>
                                            <p className="mt-0.5 truncate text-[11px] text-stone-500 dark:text-stone-400">
                                                {skill.subtitle || skill.description}
                                            </p>
                                        </div>

                                        {isSelected ? (
                                            <div className="absolute right-2.5 top-2.5 flex size-4 items-center justify-center rounded-full bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900">
                                                <Check className="size-2.5 stroke-[3]" />
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex h-36 flex-col items-center justify-center text-xs text-stone-400">
                            未找到相关技能
                        </div>
                    )}

                    <div className="mt-4 pb-1 text-center text-[11px] text-stone-400">
                        更多技能持续上线中
                    </div>
                </div>
            </div>
        </div>
    );
};
