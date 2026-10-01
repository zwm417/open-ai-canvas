import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { BUILTIN_CATEGORIES, BUILTIN_SKILLS } from "../catalog/builtin-skills";
import { SkillBadgeIcon } from "./skill-icons";

interface SkillNavTooltipProps {
    children: React.ReactNode;
    collapsed?: boolean;
}

export const SkillNavTooltip: React.FC<SkillNavTooltipProps> = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<number | null>(null);
    const navigate = useNavigate();

    const updateCoords = () => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const top = Math.max(12, Math.min(window.innerHeight - 380, rect.top - 12));
        const left = rect.right + 8;
        setCoords({ top, left });
    };

    const handleMouseEnter = () => {
        if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        updateCoords();
        setIsOpen(true);
    };

    const handleMouseLeave = () => {
        timeoutRef.current = window.setTimeout(() => {
            setIsOpen(false);
        }, 200);
    };

    const handleSkillClick = (skillId: string) => {
        setIsOpen(false);
        navigate(`/image?skill=${skillId}`);
    };

    // 筛选出有技能的内置分类
    const populatedCategories = BUILTIN_CATEGORIES.filter(
        (cat) => cat.id !== "recommend" && BUILTIN_SKILLS.some((s) => s.categoryId === cat.id)
    );

    return (
        <div
            ref={triggerRef}
            className="relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {children}

            {isOpen && typeof document !== "undefined" && createPortal(
                <div
                    className="fixed z-[99999] py-3 px-3.5 rounded-2xl border border-black/[0.08] bg-white shadow-2xl backdrop-blur-md dark:border-white/[0.08] dark:bg-[#1c1c1e] text-stone-900 dark:text-stone-100 w-[240px] animate-in fade-in zoom-in-95 duration-150"
                    style={{
                        top: `${coords.top}px`,
                        left: `${coords.left}px`,
                    }}
                    onMouseEnter={() => {
                        if (timeoutRef.current) {
                            window.clearTimeout(timeoutRef.current);
                            timeoutRef.current = null;
                        }
                    }}
                    onMouseLeave={handleMouseLeave}
                >
                    <div className="flex flex-col gap-3">
                        {populatedCategories.map((category) => {
                            const skills = BUILTIN_SKILLS.filter((s) => s.categoryId === category.id);
                            if (!skills.length) return null;

                            return (
                                <div key={category.id} className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-semibold text-stone-400 dark:text-stone-500">
                                            {category.name}
                                        </span>
                                        <div className="h-px flex-1 bg-black/[0.04] dark:bg-white/[0.04]" />
                                    </div>

                                    <div className="grid grid-cols-2 gap-1">
                                        {skills.map((skill) => (
                                            <button
                                                key={skill.id}
                                                type="button"
                                                onClick={() => handleSkillClick(skill.id)}
                                                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs text-stone-700 hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-[#2c2c2e] dark:hover:text-stone-100 transition-colors group cursor-pointer"
                                            >
                                                <SkillBadgeIcon
                                                    type={skill.badgeIcon}
                                                    className="size-3.5 text-stone-400 group-hover:text-stone-700 dark:text-stone-500 dark:group-hover:text-stone-200 shrink-0"
                                                />
                                                <span className="truncate">{skill.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
