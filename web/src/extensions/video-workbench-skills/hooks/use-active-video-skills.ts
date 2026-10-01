import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { findVideoSkill, BUILTIN_VIDEO_SKILLS } from "../catalog/builtin-video-skills";
import type { VideoWorkbenchSkill } from "../types/video-skill-contract";

const STORAGE_KEY = "opc_active_video_skill_id";
const DIRECTOR_MODE_KEY = "opc_video_director_mode";

export function useActiveVideoSkills() {
    const [searchParams, setSearchParams] = useSearchParams();
    const querySkill = searchParams.get("skill");

    const [activeSkillId, setActiveSkillId] = useState<string | null>(() => {
        if (querySkill && findVideoSkill(querySkill)) return querySkill;
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved && findVideoSkill(saved)) return saved;
        } catch {
            // ignore
        }
        return null;
    });

    const [isDirectorMode, setIsDirectorMode] = useState<boolean>(() => {
        // 如果有 querySkill，默认进入对应模式
        if (querySkill && findVideoSkill(querySkill)) return true;
        return false;
    });

    const activeSkill: VideoWorkbenchSkill | null = useMemo(() => {
        if (!activeSkillId) return null;
        return findVideoSkill(activeSkillId) || null;
    }, [activeSkillId]);

    // 监听 URL 参数变化
    useEffect(() => {
        if (querySkill && findVideoSkill(querySkill)) {
            setActiveSkillId(querySkill);
            setIsDirectorMode(true);
        }
    }, [querySkill]);

    // 选择卡片
    const selectSkill = useCallback(
        (skillId: string | null) => {
            if (!skillId) {
                // 清除选择
                setActiveSkillId(null);
                setIsDirectorMode(false);
                try {
                    localStorage.removeItem(STORAGE_KEY);
                    localStorage.setItem(DIRECTOR_MODE_KEY, "false");
                } catch {
                    // ignore
                }
                setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.delete("skill");
                    return next;
                });
                return;
            }

            const found = findVideoSkill(skillId);
            if (found) {
                setActiveSkillId(skillId);
                setIsDirectorMode(true);
                try {
                    localStorage.setItem(STORAGE_KEY, skillId);
                    localStorage.setItem(DIRECTOR_MODE_KEY, "true");
                } catch {
                    // ignore
                }
                setSearchParams((prev) => {
                    const next = new URLSearchParams(prev);
                    next.set("skill", skillId);
                    return next;
                });
            }
        },
        [setSearchParams],
    );

    // 进入编导助手模式
    const enterDirectorMode = useCallback(() => {
        setIsDirectorMode(true);
        try {
            localStorage.setItem(DIRECTOR_MODE_KEY, "true");
        } catch {
            // ignore
        }
    }, []);

    // 退出编导助手模式
    const exitDirectorMode = useCallback(() => {
        setIsDirectorMode(false);
        try {
            localStorage.setItem(DIRECTOR_MODE_KEY, "false");
        } catch {
            // ignore
        }
    }, []);

    return {
        activeSkillId,
        activeSkill,
        isDirectorMode,
        selectSkill,
        enterDirectorMode,
        exitDirectorMode,
    };
}
