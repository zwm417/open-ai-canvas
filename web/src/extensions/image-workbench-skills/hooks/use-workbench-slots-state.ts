// @opc-feature: image_workbench_skills [start]
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { nanoid } from "nanoid";
import { uploadImage } from "@/services/image-storage";
import { useImageWorkbenchStore } from "@/stores/use-image-workbench-store";
import type { ActiveSlotFile, SlotFilesContainer, WorkbenchSkill } from "../types/skill-contract";
import type { ReferenceImage } from "@/types/image";

export function useWorkbenchSlotsState(skill: WorkbenchSkill | null) {
    const draftSlotContainers = useImageWorkbenchStore((state) => state.draft.slotContainers) || {};
    const updateDraft = useImageWorkbenchStore((state) => state.updateDraft);
    const slotContainers = draftSlotContainers;
    const setSlotContainers = useCallback((updater: Record<string, SlotFilesContainer> | ((prev: Record<string, SlotFilesContainer>) => Record<string, SlotFilesContainer>)) => {
        updateDraft((prevDraft) => {
            const prev = prevDraft.slotContainers || {};
            const next = typeof updater === "function" ? updater(prev) : updater;
            return {
                ...prevDraft,
                slotContainers: next,
            };
        });
    }, [updateDraft]);
    const objectUrlsRef = useRef<Set<string>>(new Set());

    // 上一次的技能 ID，用于跨卡片切换时素材平滑迁移与自动合并
    const prevSkillIdRef = useRef<string | null | undefined>(undefined);

    // 切换卡片时的素材保留与槽位减少自动合并逻辑
    useEffect(() => {
        if (prevSkillIdRef.current === undefined) {
            prevSkillIdRef.current = skill?.id || null;
            return;
        }

        const prevId = prevSkillIdRef.current;
        const currentId = skill?.id || null;
        if (prevId === currentId) {
            return;
        }
        prevSkillIdRef.current = currentId;

        // 提取原卡片中所有已上传的素材文件（按槽位顺序拉平）
        setSlotContainers((prevContainers) => {
            const allExistingFiles: ActiveSlotFile[] = [];
            for (const container of Object.values(prevContainers)) {
                if (container && container.files && container.files.length > 0) {
                    allExistingFiles.push(...container.files);
                }
            }

            // 若原先没有任何素材，直接初始化为空
            if (allExistingFiles.length === 0) {
                return {};
            }

            // 若切换到无技能（通用生图模式），槽位容器置空（素材由页面层提取至通用 references）
            if (!skill || !skill.uploadSlots || skill.uploadSlots.length === 0) {
                return {};
            }

            const newSlots = skill.uploadSlots;
            const slotCount = newSlots.length;
            const nextContainers: Record<string, SlotFilesContainer> = {};

            // 槽位减少时自动合并分配：
            // 1. 若新卡片只有 1 个槽位：全部素材合并进新槽位，呈折叠态
            // 2. 若新卡片有 N 个槽位：前 N - 1 个槽位各分 1 张，剩余所有素材合并进第 N 个槽位
            if (slotCount === 1) {
                const targetSlotId = newSlots[0].id;
                const updatedFiles = allExistingFiles.map((file) => ({
                    ...file,
                    slotId: targetSlotId,
                }));
                nextContainers[targetSlotId] = {
                    files: updatedFiles,
                    activeId: updatedFiles[0]?.id,
                };
            } else {
                for (let i = 0; i < slotCount; i++) {
                    const targetSlotId = newSlots[i].id;
                    if (i < slotCount - 1) {
                        const file = allExistingFiles[i];
                        if (file) {
                            nextContainers[targetSlotId] = {
                                files: [{ ...file, slotId: targetSlotId }],
                                activeId: file.id,
                            };
                        } else {
                            nextContainers[targetSlotId] = { files: [] };
                        }
                    } else {
                        // 最后一个槽位容纳所有剩余多出的素材（自动合并折叠）
                        const remainingFiles = allExistingFiles.slice(i).map((file) => ({
                            ...file,
                            slotId: targetSlotId,
                        }));
                        nextContainers[targetSlotId] = {
                            files: remainingFiles,
                            activeId: remainingFiles[0]?.id,
                        };
                    }
                }
            }

            return nextContainers;
        });
    }, [skill?.id]);

    // 向后兼容：slotFiles 映射当前槽位的生效主图（或首张图）
    const slotFiles = useMemo<Record<string, ActiveSlotFile | undefined>>(() => {
        const result: Record<string, ActiveSlotFile | undefined> = {};
        for (const [slotId, container] of Object.entries(slotContainers)) {
            if (!container.files || container.files.length === 0) continue;
            const active = container.files.find((f) => f.id === container.activeId) || container.files[0];
            result[slotId] = active;
        }
        return result;
    }, [slotContainers]);

    // slotFilesMap：每个槽位包含的所有素材列表（用于多素材折叠展示）
    const slotFilesMap = useMemo<Record<string, ActiveSlotFile[]>>(() => {
        const result: Record<string, ActiveSlotFile[]> = {};
        for (const [slotId, container] of Object.entries(slotContainers)) {
            result[slotId] = container.files || [];
        }
        return result;
    }, [slotContainers]);

    // slotActiveIdMap：每个槽位当前选中的生效主图 ID
    const slotActiveIdMap = useMemo<Record<string, string | undefined>>(() => {
        const result: Record<string, string | undefined> = {};
        for (const [slotId, container] of Object.entries(slotContainers)) {
            result[slotId] = container.activeId || container.files[0]?.id;
        }
        return result;
    }, [slotContainers]);

    // 设置/替换槽位的主图（槽位为空时添加，已有则更新主图）
    const setSlotFile = useCallback(async (slotId: string, file: File | Blob, customName?: string) => {
        const previewUrl = URL.createObjectURL(file);
        objectUrlsRef.current.add(previewUrl);

        const fileName = customName || (file instanceof File ? file.name : `${slotId}-${nanoid(6)}.png`);
        const tempId = nanoid();

        const pendingItem: ActiveSlotFile = {
            id: tempId,
            slotId,
            name: fileName,
            dataUrl: previewUrl,
            previewUrl,
            file: file instanceof File ? file : undefined,
            bytes: file.size,
            mimeType: file.type || "image/png",
        };

        setSlotContainers((prev) => {
            const container = prev[slotId] || { files: [] };
            const existingFiles = container.files || [];
            let nextFiles: ActiveSlotFile[];
            if (existingFiles.length === 0) {
                nextFiles = [pendingItem];
            } else {
                // 替换当前生效的主图
                const curActiveId = container.activeId || existingFiles[0]?.id;
                nextFiles = existingFiles.map((f) => (f.id === curActiveId ? pendingItem : f));
            }
            return {
                ...prev,
                [slotId]: {
                    files: nextFiles,
                    activeId: tempId,
                },
            };
        });

        // 异步静默持久化上传
        try {
            const uploaded = await uploadImage(file);
            setSlotContainers((prev) => {
                const container = prev[slotId];
                if (!container) return prev;
                const nextFiles = container.files.map((f) => {
                    if (f.id === tempId) {
                        return {
                            ...f,
                            dataUrl: uploaded.url,
                            previewUrl: uploaded.url,
                            storageKey: uploaded.storageKey,
                            width: uploaded.width,
                            height: uploaded.height,
                        };
                    }
                    return f;
                });
                return {
                    ...prev,
                    [slotId]: { ...container, files: nextFiles },
                };
            });
        } catch {
            // 本地 previewUrl 仍可正常保真展示与端侧提交
        }
    }, [setSlotContainers]);

    // 向指定槽位追加素材（使该槽位包含多张素材并自动进入折叠态）
    const addSlotFile = useCallback(async (slotId: string, file: File | Blob, customName?: string) => {
        const previewUrl = URL.createObjectURL(file);
        objectUrlsRef.current.add(previewUrl);

        const fileName = customName || (file instanceof File ? file.name : `${slotId}-${nanoid(6)}.png`);
        const tempId = nanoid();

        const pendingItem: ActiveSlotFile = {
            id: tempId,
            slotId,
            name: fileName,
            dataUrl: previewUrl,
            previewUrl,
            file: file instanceof File ? file : undefined,
            bytes: file.size,
            mimeType: file.type || "image/png",
        };

        setSlotContainers((prev) => {
            const container = prev[slotId] || { files: [] };
            const nextFiles = [...(container.files || []), pendingItem];
            return {
                ...prev,
                [slotId]: {
                    files: nextFiles,
                    activeId: container.activeId || nextFiles[0]?.id,
                },
            };
        });

        try {
            const uploaded = await uploadImage(file);
            setSlotContainers((prev) => {
                const container = prev[slotId];
                if (!container) return prev;
                const nextFiles = container.files.map((f) => {
                    if (f.id === tempId) {
                        return {
                            ...f,
                            dataUrl: uploaded.url,
                            previewUrl: uploaded.url,
                            storageKey: uploaded.storageKey,
                            width: uploaded.width,
                            height: uploaded.height,
                        };
                    }
                    return f;
                });
                return {
                    ...prev,
                    [slotId]: { ...container, files: nextFiles },
                };
            });
        } catch {
            // ignore
        }
    }, [setSlotContainers]);

    // 设为槽位当前生效主图
    const setSlotActiveFile = useCallback((slotId: string, fileId: string) => {
        setSlotContainers((prev) => {
            const container = prev[slotId];
            if (!container || !container.files) return prev;
            // 将设为主图的文件移到数组最前，并更新 activeId
            const target = container.files.find((f) => f.id === fileId);
            if (!target) return prev;
            const otherFiles = container.files.filter((f) => f.id !== fileId);
            return {
                ...prev,
                [slotId]: {
                    files: [target, ...otherFiles],
                    activeId: fileId,
                },
            };
        });
    }, [setSlotContainers]);

    // 删除槽位内指定的某一张素材
    const removeSlotFile = useCallback((slotId: string, fileId: string) => {
        setSlotContainers((prev) => {
            const container = prev[slotId];
            if (!container || !container.files) return prev;
            const fileToRemove = container.files.find((f) => f.id === fileId);
            if (fileToRemove?.previewUrl && fileToRemove.previewUrl.startsWith("blob:")) {
                URL.revokeObjectURL(fileToRemove.previewUrl);
                objectUrlsRef.current.delete(fileToRemove.previewUrl);
            }
            const nextFiles = container.files.filter((f) => f.id !== fileId);
            if (nextFiles.length === 0) {
                const next = { ...prev };
                delete next[slotId];
                return next;
            }
            return {
                ...prev,
                [slotId]: {
                    files: nextFiles,
                    activeId: container.activeId === fileId ? nextFiles[0].id : container.activeId,
                },
            };
        });
    }, [setSlotContainers]);

    // 替换槽位内指定的某一张素材
    const replaceSlotFile = useCallback(async (slotId: string, fileId: string, file: File | Blob, customName?: string) => {
        const previewUrl = URL.createObjectURL(file);
        objectUrlsRef.current.add(previewUrl);

        const fileName = customName || (file instanceof File ? file.name : `${slotId}-${nanoid(6)}.png`);
        const tempId = nanoid();

        const pendingItem: ActiveSlotFile = {
            id: tempId,
            slotId,
            name: fileName,
            dataUrl: previewUrl,
            previewUrl,
            file: file instanceof File ? file : undefined,
            bytes: file.size,
            mimeType: file.type || "image/png",
        };

        setSlotContainers((prev) => {
            const container = prev[slotId];
            if (!container || !container.files) return prev;
            const old = container.files.find((f) => f.id === fileId);
            if (old?.previewUrl && old.previewUrl.startsWith("blob:")) {
                URL.revokeObjectURL(old.previewUrl);
                objectUrlsRef.current.delete(old.previewUrl);
            }
            const nextFiles = container.files.map((f) => (f.id === fileId ? pendingItem : f));
            return {
                ...prev,
                [slotId]: {
                    files: nextFiles,
                    activeId: container.activeId === fileId ? tempId : container.activeId,
                },
            };
        });

        try {
            const uploaded = await uploadImage(file);
            setSlotContainers((prev) => {
                const container = prev[slotId];
                if (!container) return prev;
                const nextFiles = container.files.map((f) => {
                    if (f.id === tempId) {
                        return {
                            ...f,
                            dataUrl: uploaded.url,
                            previewUrl: uploaded.url,
                            storageKey: uploaded.storageKey,
                            width: uploaded.width,
                            height: uploaded.height,
                        };
                    }
                    return f;
                });
                return {
                    ...prev,
                    [slotId]: { ...container, files: nextFiles },
                };
            });
        } catch {
            // ignore
        }
    }, [setSlotContainers]);

    // 清空整个槽位
    const clearSlot = useCallback((slotId: string) => {
        setSlotContainers((prev) => {
            const container = prev[slotId];
            if (container && container.files) {
                container.files.forEach((f) => {
                    if (f.previewUrl && f.previewUrl.startsWith("blob:")) {
                        URL.revokeObjectURL(f.previewUrl);
                        objectUrlsRef.current.delete(f.previewUrl);
                    }
                });
            }
            const next = { ...prev };
            delete next[slotId];
            return next;
        });
    }, [setSlotContainers]);

    // 清空所有槽位
    const clearAllSlots = useCallback(() => {
        objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        objectUrlsRef.current.clear();
        setSlotContainers({});
    }, [setSlotContainers]);

    // 导入外部图片（如从通用 references 导入技能卡片，槽位少时自动合并折叠）
    const importExternalReferences = useCallback((refs: ReferenceImage[], targetSkill: WorkbenchSkill | null) => {
        if (!refs || refs.length === 0 || !targetSkill || !targetSkill.uploadSlots || targetSkill.uploadSlots.length === 0) {
            return;
        }

        const convertedFiles: ActiveSlotFile[] = refs.map((ref) => ({
            id: ref.id || nanoid(),
            slotId: "",
            name: ref.name || "reference.png",
            dataUrl: ref.dataUrl || "",
            previewUrl: ref.dataUrl || "",
            storageKey: ref.storageKey,
            mimeType: ref.type || "image/png",
        }));

        const newSlots = targetSkill.uploadSlots;
        const slotCount = newSlots.length;
        const nextContainers: Record<string, SlotFilesContainer> = {};

        if (slotCount === 1) {
            const targetSlotId = newSlots[0].id;
            const updated = convertedFiles.map((f) => ({ ...f, slotId: targetSlotId }));
            nextContainers[targetSlotId] = {
                files: updated,
                activeId: updated[0]?.id,
            };
        } else {
            for (let i = 0; i < slotCount; i++) {
                const targetSlotId = newSlots[i].id;
                if (i < slotCount - 1) {
                    const file = convertedFiles[i];
                    if (file) {
                        nextContainers[targetSlotId] = {
                            files: [{ ...file, slotId: targetSlotId }],
                            activeId: file.id,
                        };
                    } else {
                        nextContainers[targetSlotId] = { files: [] };
                    }
                } else {
                    const remaining = convertedFiles.slice(i).map((f) => ({ ...f, slotId: targetSlotId }));
                    nextContainers[targetSlotId] = {
                        files: remaining,
                        activeId: remaining[0]?.id,
                    };
                }
            }
        }

        setSlotContainers(nextContainers);
    }, [setSlotContainers]);

    // 获取所有槽位里的全部素材列表（供切回通用模式时无损还原至 references）
    const getAllSlotFiles = useCallback((): ActiveSlotFile[] => {
        const all: ActiveSlotFile[] = [];
        for (const container of Object.values(slotContainers)) {
            if (container && container.files && container.files.length > 0) {
                all.push(...container.files);
            }
        }
        return all;
    }, [slotContainers]);

    // 校验必填槽位是否已填充
    const isSlotsValid = useCallback(() => {
        if (!skill) return true;
        for (const slot of skill.uploadSlots) {
            const container = slotContainers[slot.id];
            const hasValidFile = container && container.files && container.files.some((f) => Boolean(f.dataUrl));
            if (!slot.optional && !hasValidFile) {
                return false;
            }
        }
        return true;
    }, [skill, slotContainers]);

    // 已上传素材总数（包含折叠素材）
    const uploadedCount = useMemo(() => {
        let count = 0;
        for (const container of Object.values(slotContainers)) {
            if (container && container.files) {
                count += container.files.filter((f) => Boolean(f.dataUrl)).length;
            }
        }
        return count;
    }, [slotContainers]);

    const maxFiles = skill?.maxFiles ?? 9;

    return {
        slotFiles,
        slotFilesMap,
        slotActiveIdMap,
        setSlotFile,
        addSlotFile,
        setSlotActiveFile,
        removeSlotFile,
        replaceSlotFile,
        clearSlot,
        clearAllSlots,
        importExternalReferences,
        getAllSlotFiles,
        isSlotsValid,
        uploadedCount,
        maxFiles,
    };
}
// @opc-feature: image_workbench_skills [end]
