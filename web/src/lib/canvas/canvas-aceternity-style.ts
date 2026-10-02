import type { CSSProperties } from "react";

import type { CanvasTheme } from "@/lib/canvas-theme";

// @opc-feature: canvas-dock-adaptive-surface [start]
export function canvasDockStyle(theme: CanvasTheme, color: string = theme.toolbar.item): CSSProperties {
    const dockBg = theme.spatial.elevated || theme.toolbar.panel;
    const dockBorder = theme.toolbar.border || "transparent";
    const isDark = theme.canvas.background === "#000000" || theme.node.fill === "#181818" || theme.accent.primary === "#f5f5f5";
    return {
        background: "var(--dock-surface)",
        borderColor: "var(--dock-border)",
        color,
        boxShadow: "var(--elevation-overlay)",
        "--dock-surface": dockBg,
        "--dock-border": dockBorder,
        "--dock-command-bg": theme.spatial.surface,
        "--dock-command-hover": theme.toolbar.itemHover,
        "--dock-command-active": theme.toolbar.activeBg,
        "--dock-command-active-text": theme.toolbar.activeText,
        "--dock-command-danger": theme.accent.danger,
        "--dock-tooltip-bg": theme.spatial.elevated,
        "--dock-tooltip-border": theme.toolbar.border,
        "--dock-switch-track": isDark ? "#000000" : "#e4e4e7",
        "--dock-switch-border": isDark ? "rgba(255, 255, 255, 0.12)" : "transparent",
        "--dock-switch-thumb": isDark ? "#141416" : "#ffffff",
        "--dock-switch-thumb-border": isDark ? "rgba(255, 255, 255, 0.16)" : "transparent",
        "--dock-switch-thumb-text": isDark ? "#ffffff" : "#18181b",
        "--dock-switch-text": isDark ? "#a1a1aa" : "#71717a",
        "--dock-switch-hover-text": isDark ? "#ffffff" : "#18181b",
    } as CSSProperties;
}
// @opc-feature: canvas-dock-adaptive-surface [end]
