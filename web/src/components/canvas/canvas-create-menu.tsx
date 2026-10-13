// @opc-feature: canvas-create-menu-redesign [start]
import { motion, useReducedMotion } from "motion/react";
import { useState, type ReactNode } from "react";
import { ChevronDown, Pin, Sparkles } from "lucide-react";

import { aceternityMotion } from "@/lib/aceternity-motion";
import { cn } from "@/lib/utils";
import { scopedLocalStorage } from "@/lib/user-scope";
import { getCanvasCreateMenuIcon } from "./canvas-create-menu-icons";

export type CanvasCreateCommand = {
    id: string;
    label: string;
    icon: ReactNode;
    badge?: string;
    section: "node" | "workflow" | "project" | "resource";
    onClick: () => void;
};

const CANVAS_CREATE_PINNED_STORAGE_KEY = "canvas:create-menu:pinned-command-ids";

function getSavedPinnedIds(): Set<string> {
    try {
        const stored = scopedLocalStorage.getItem(CANVAS_CREATE_PINNED_STORAGE_KEY);
        if (!stored) return new Set();
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed)) return new Set(parsed.filter((item): item is string => typeof item === "string"));
    } catch {
        // ignore
    }
    return new Set();
}

function savePinnedIds(ids: Set<string>) {
    try {
        scopedLocalStorage.setItem(CANVAS_CREATE_PINNED_STORAGE_KEY, JSON.stringify(Array.from(ids)));
    } catch {
        // ignore
    }
}

// 核心创作节点标准顺序 (8个基础节点)
const PRIMARY_CREATION_IDS = [
    "text",
    "image",
    "video",
    "audio",
    "script",
    "project-character",
    "director",
    "drawing",
];

// 本地二开 AI 编导与智能套件节点
const SECONDARY_AI_CREATION_IDS = [
    "creative-asset-table",
    "creative-voice-table",
    "creative-storyboard-table",
    "video-reverse",
    "creation-assistant-analysis",
    "creation-assistant-script",
    "creation-assistant-ref-script",
];

// 画布与资源节点
const RESOURCE_NODE_IDS = [
    "frame",
    "workflow",
    "upload",
    "assets",
];

export function CanvasCreateMenu({ commands }: { commands: CanvasCreateCommand[] }) {
    const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => getSavedPinnedIds());
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const togglePin = (id: string) => {
        setPinnedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            savePinnedIds(next);
            return next;
        });
    };

    // 1. 顶部项目动作 (如项目画风)
    const projectCommands = commands.filter((c) => c.section === "project" || c.id === "style");

    // 2. 常用置顶列表
    const pinnedCommands = commands.filter((c) => pinnedIds.has(c.id) && c.id !== "style" && c.section !== "project");

    // 3. 核心创作节点 (按标准 4x2 顺序检索已有命令)
    const primaryCommands = PRIMARY_CREATION_IDS.map((id) => commands.find((c) => c.id === id)).filter((c): c is CanvasCreateCommand => Boolean(c));

    // 4. 二开智能节点
    const aiCommands = SECONDARY_AI_CREATION_IDS.map((id) => commands.find((c) => c.id === id)).filter((c): c is CanvasCreateCommand => Boolean(c));

    // 5. 画布与资源节点 (紧凑排布)
    const resourceCommands = RESOURCE_NODE_IDS.map((id) => commands.find((c) => c.id === id)).filter((c): c is CanvasCreateCommand => Boolean(c));

    // 6. 更多高级工具 (未被上述分组消费的命令，如文件夹、转换、插件扩展)
    const consumedIds = new Set([
        ...PRIMARY_CREATION_IDS,
        ...SECONDARY_AI_CREATION_IDS,
        ...RESOURCE_NODE_IDS,
        "style",
    ]);
    const advancedCommands = commands.filter((c) => !consumedIds.has(c.id) && c.section !== "project");

    return (
        <div className="flex flex-col select-none">
            {/* 顶栏：标题 + 辅助说明 + 项目画风胶囊 */}
            <header className="flex min-h-7 items-center justify-between gap-2 pb-1.5">
                <div className="flex items-baseline gap-2 min-w-0">
                    <h2 className="font-semibold text-sm leading-none text-stone-900 dark:text-stone-100 tracking-tight">添加节点</h2>
                    <span className="text-[11px] font-normal text-stone-400 dark:text-stone-500 truncate">创作与工具图元</span>
                </div>
                {projectCommands.map((command) => (
                    <button
                        key={command.id}
                        type="button"
                        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 font-medium outline-none transition-all hover:bg-amber-500/20 hover:border-amber-500/40 focus-visible:ring-2 dark:border-amber-400/25 dark:bg-amber-400/10 dark:hover:bg-amber-400/20 text-amber-700 dark:text-amber-300 text-xs shadow-xs cursor-pointer"
                        aria-label={command.label}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={command.onClick}
                    >
                        <span className="grid size-3.5 place-items-center">{getCanvasCreateMenuIcon(command.id, command.icon, "size-3.5")}</span>
                        <span className="whitespace-nowrap font-medium text-[11px]">{command.label}</span>
                    </button>
                ))}
            </header>

            <div className="mb-2 h-px bg-black/[0.06] dark:bg-white/[0.08]" />

            {/* 常用置顶专区 (用户自定义收藏节点) */}
            {pinnedCommands.length > 0 ? (
                <div className="mb-2.5">
                    <MenuSection
                        title="常用置顶"
                        icon={<Pin className="size-3 text-amber-500 fill-amber-500/30 dark:text-amber-400" />}
                        count={pinnedCommands.length}
                    />
                    <CanvasCreateCommandGrid
                        commands={pinnedCommands}
                        variant="node"
                        pinnedIds={pinnedIds}
                        onTogglePin={togglePin}
                    />
                </div>
            ) : null}

            {/* 创作节点 (4列经典网格) */}
            {primaryCommands.length > 0 ? (
                <div>
                    <MenuSection title="创作节点" />
                    <CanvasCreateCommandGrid
                        commands={primaryCommands}
                        variant="node"
                        pinnedIds={pinnedIds}
                        onTogglePin={togglePin}
                    />
                </div>
            ) : null}

            {/* 本地二开 AI 编导与创意套件 */}
            {aiCommands.length > 0 ? (
                <div className="mt-2.5">
                    <MenuSection
                        title="AI 编导与创意套件"
                        icon={<Sparkles className="size-3 text-indigo-500 dark:text-indigo-400" />}
                        count={aiCommands.length}
                    />
                    <CanvasCreateCommandGrid
                        commands={aiCommands}
                        variant="node"
                        pinnedIds={pinnedIds}
                        onTogglePin={togglePin}
                    />
                </div>
            ) : null}

            {/* 画布与资源 (紧凑横排按钮) */}
            {resourceCommands.length > 0 ? (
                <div className="mt-2.5">
                    <MenuSection title="画布与资源" />
                    <CanvasCreateCommandGrid
                        commands={resourceCommands}
                        variant="compact"
                        pinnedIds={pinnedIds}
                        onTogglePin={togglePin}
                    />
                </div>
            ) : null}

            {/* 更多高级工具 (折叠区，动态计算计数) */}
            {advancedCommands.length > 0 ? (
                <div className="mt-2.5 pt-1 border-t border-black/[0.04] dark:border-white/[0.06]">
                    <button
                        type="button"
                        onClick={() => setAdvancedOpen((v) => !v)}
                        className="flex w-full items-center justify-between px-1 py-1.5 text-left text-xs font-medium text-stone-500 transition-colors hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 cursor-pointer"
                    >
                        <span>更多高级工具 ({advancedCommands.length})</span>
                        <ChevronDown className={cn("size-3.5 transition-transform duration-200", advancedOpen && "rotate-180")} />
                    </button>
                    {advancedOpen ? (
                        <div className="mt-1">
                            <CanvasCreateCommandGrid
                                commands={advancedCommands}
                                variant="node"
                                pinnedIds={pinnedIds}
                                onTogglePin={togglePin}
                            />
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

function CanvasCreateCommandGrid({
    commands,
    variant,
    pinnedIds,
    onTogglePin,
}: {
    commands: CanvasCreateCommand[];
    variant: "node" | "compact" | "workflow";
    pinnedIds?: Set<string>;
    onTogglePin?: (id: string) => void;
}) {
    const reducedMotion = useReducedMotion();

    return (
        <div className={cn("grid gap-1.5", variant === "node" ? "grid-cols-4" : variant === "workflow" ? "grid-cols-1" : "grid-cols-4")}>
            {commands.map((command) => {
                const isPinned = Boolean(pinnedIds?.has(command.id));
                const isCompact = variant === "compact";
                const icon = getCanvasCreateMenuIcon(command.id, command.icon, isCompact ? "size-3.5" : "size-5");

                return (
                    <motion.button
                        key={command.id}
                        type="button"
                        whileHover={reducedMotion ? undefined : { y: -1, scale: 1.01 }}
                        whileTap={reducedMotion ? undefined : { scale: 0.98 }}
                        transition={aceternityMotion.spring.dock}
                        className={cn(
                            "group relative min-w-0 overflow-hidden border outline-none transition-all cursor-pointer",
                            "border-black/10 bg-white/70 hover:border-black/25 hover:bg-black/[0.04]",
                            "dark:border-white/10 dark:bg-white/[.04] dark:hover:border-white/20 dark:hover:bg-white/[.08]",
                            "focus-visible:ring-2 focus-visible:ring-amber-500/50",
                            variant === "node"
                                ? "flex h-[var(--canvas-create-node-height)] flex-col items-start justify-between rounded-[10px] p-2 text-left"
                                : variant === "workflow"
                                    ? "flex h-[var(--canvas-create-resource-height)] items-center justify-start gap-2 rounded-[8px] px-2 text-left"
                                    : "flex h-[var(--canvas-create-resource-height)] items-center justify-center gap-1.5 rounded-[8px] px-1 text-center",
                        )}
                        aria-label={command.label}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={command.onClick}
                    >
                        {variant === "node" ? (
                            <>
                                <div className="flex w-full min-w-0 items-center justify-between gap-1">
                                    <span className="grid size-6 shrink-0 place-items-center opacity-90 transition-transform group-hover:scale-110">
                                        {icon}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        {command.badge && !isPinned ? (
                                            <span className="text-[9px] font-medium leading-none px-1 py-0.5 rounded text-stone-400 border border-stone-200 dark:border-white/10 dark:text-stone-400 group-hover:hidden">
                                                {command.badge}
                                            </span>
                                        ) : null}
                                        {onTogglePin ? (
                                            <button
                                                type="button"
                                                aria-label={isPinned ? "取消置顶" : "置顶到常用"}
                                                title={isPinned ? "取消置顶" : "置顶到常用"}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onTogglePin(command.id);
                                                }}
                                                className={cn(
                                                    "grid size-4.5 place-items-center rounded transition-all cursor-pointer",
                                                    isPinned
                                                        ? "text-amber-500 bg-amber-500/15 opacity-100 dark:text-amber-400 dark:bg-amber-400/20"
                                                        : "opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:bg-black/10 dark:hover:bg-white/10 text-stone-400 hover:text-amber-500",
                                                )}
                                            >
                                                <Pin className={cn("size-2.5", isPinned && "fill-current")} />
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                                <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold text-stone-800 dark:text-stone-200">
                                    {command.label}
                                </span>
                            </>
                        ) : (
                            <>
                                <span className="grid size-4 shrink-0 place-items-center opacity-85 transition-opacity group-hover:opacity-100">
                                    {icon}
                                </span>
                                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-stone-700 dark:text-stone-300">
                                    {command.label}
                                </span>
                            </>
                        )}
                    </motion.button>
                );
            })}
        </div>
    );
}

function MenuSection({
    title,
    icon,
    count,
}: {
    title: string;
    icon?: ReactNode;
    count?: number;
}) {
    return (
        <div className="mb-1.5 flex items-center gap-1.5 px-1 font-medium leading-none text-stone-400 dark:text-stone-400 text-xs">
            {icon}
            <span>{title}</span>
            {count !== undefined ? <span className="text-[10px] text-stone-400/80 font-normal">({count})</span> : null}
        </div>
    );
}
// @opc-feature: canvas-create-menu-redesign [end]
