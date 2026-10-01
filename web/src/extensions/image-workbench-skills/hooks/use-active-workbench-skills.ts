import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router";
import { usePluginStore, isPluginEffectivelyEnabled } from "@/stores/use-plugin-store";
import { BUILTIN_CATEGORIES, BUILTIN_SKILLS } from "../catalog/builtin-skills";
import type { SkillCategory, WorkbenchSkill } from "../types/skill-contract";

export function useActiveWorkbenchSkills() {
    const [searchParams, setSearchParams] = useSearchParams();
    const pluginStore = usePluginStore();

    // 从 URL query 获取初始 skill
    const querySkillId = searchParams.get("skill");
    const [selectedSkillId, setSelectedSkillId] = useState<string | null>(querySkillId);

    useEffect(() => {
        if (querySkillId && querySkillId !== selectedSkillId) {
            setSelectedSkillId(querySkillId);
        }
    }, [querySkillId]);

    // 聚合已启用插件贡献的分类与技能
    const { categories, skills } = useMemo(() => {
        const catMap = new Map<string, SkillCategory>();
        BUILTIN_CATEGORIES.forEach((cat) => catMap.set(cat.id, { ...cat }));

        const skillMap = new Map<string, WorkbenchSkill>();
        BUILTIN_SKILLS.forEach((skill) => skillMap.set(skill.id, { ...skill }));

        // 检查动态插件安装与贡献点
        pluginStore.installations.forEach((inst) => {
            const pluginId = inst.manifest.id;
            const isEnabled = isPluginEffectivelyEnabled(pluginId, inst.enabled);
            if (!isEnabled) return;

            // 外部插件贡献的分类
            const contribCategories = inst.manifest.contributes?.workbenchCategories;
            if (Array.isArray(contribCategories)) {
                contribCategories.forEach((cat) => {
                    if (!catMap.has(cat.id)) {
                        catMap.set(cat.id, {
                            id: cat.id,
                            name: cat.name,
                            iconName: cat.icon,
                            order: cat.order ?? 10,
                            pluginId,
                        });
                    }
                });
            }

            // 外部插件贡献的技能
            const contribSkills = inst.manifest.contributes?.workbenchSkills;
            if (Array.isArray(contribSkills)) {
                contribSkills.forEach((skill) => {
                    if (!skillMap.has(skill.id)) {
                        skillMap.set(skill.id, {
                            id: skill.id,
                            categoryId: skill.categoryId,
                            secondaryCategoryIds: skill.secondaryCategoryIds,
                            name: skill.name,
                            subtitle: skill.subtitle || "",
                            description: skill.description || "",
                            isRecommended: Boolean(skill.isRecommended),
                            defaultCount: skill.defaultCount,
                            uploadSlots: skill.uploadSlots || [
                                {
                                    id: "source",
                                    label: "添加参考图",
                                    iconType: "general",
                                    semanticTag: "参考图",
                                },
                            ],
                            placeholder: skill.placeholder || "输入画面提示词，描述期望生成的场景与细节",
                            instructions: skill.instructions || "精准参考输入素材的主体外形与构图，生成高品质视觉图像。",
                            avoid: skill.avoid,
                            showcaseTitle: `${skill.name}效果示例`,
                            showcaseSubtitle: skill.subtitle || "",
                            showcaseImageUrl: skill.showcaseImageUrl || "/images/skills/product-hero.webp",
                        });
                    }
                });
            }
        });

        const sortedCategories = Array.from(catMap.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const allSkills = Array.from(skillMap.values()).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

        return {
            categories: sortedCategories,
            skills: allSkills,
        };
    }, [pluginStore.installations, pluginStore.pluginStates, pluginStore.runtimeStatuses]);

    const activeSkill = useMemo(() => {
        if (!selectedSkillId) return null;
        return skills.find((s) => s.id === selectedSkillId) || null;
    }, [selectedSkillId, skills]);

    const selectSkill = (skillId: string | null) => {
        setSelectedSkillId(skillId);
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                if (skillId) {
                    next.set("skill", skillId);
                } else {
                    next.delete("skill");
                }
                return next;
            },
            { replace: true }
        );
    };

    const getSkillsByCategory = (categoryId: string, searchKeyword = ""): WorkbenchSkill[] => {
        const keyword = searchKeyword.trim().toLowerCase();
        return skills.filter((skill) => {
            const matchesCategory =
                categoryId === "recommend"
                    ? Boolean(skill.isRecommended)
                    : skill.categoryId === categoryId || Boolean(skill.secondaryCategoryIds?.includes(categoryId));

            if (!matchesCategory) return false;
            if (!keyword) return true;

            return (
                skill.name.toLowerCase().includes(keyword) ||
                skill.subtitle.toLowerCase().includes(keyword) ||
                skill.description.toLowerCase().includes(keyword)
            );
        });
    };

    return {
        categories,
        skills,
        activeSkill,
        activeSkillId: selectedSkillId,
        selectSkill,
        getSkillsByCategory,
    };
}
