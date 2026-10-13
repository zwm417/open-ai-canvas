// @opc-feature: detail_set_workflow [start]
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Languages } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { DETAIL_SET_LANGUAGE_OPTIONS } from "../types/detail-set";

export interface ImageLanguagePopoverProps {
    value: string;
    onChange: (value: string) => void;
    className?: string;
    buttonClassName?: string;
    placement?: "top" | "bottom";
    "aria-label"?: string;
}

const ALL_LANGUAGE_OPTIONS = [
    ...DETAIL_SET_LANGUAGE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label })),
    { value: "none", label: "无文案" },
];

export function ImageLanguagePopover({
    value,
    onChange,
    className,
    buttonClassName,
    placement = "top",
    "aria-label": ariaLabel = "图片语言",
}: ImageLanguagePopoverProps) {
    const rawTheme = useActiveTheme();
    const theme = canvasThemes[rawTheme] ?? canvasThemes.dark;
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);

    const currentOption = ALL_LANGUAGE_OPTIONS.find((opt) => opt.value === value) || ALL_LANGUAGE_OPTIONS[0];

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => {
            if (buttonRef.current) {
                setButtonRect(buttonRef.current.getBoundingClientRect());
            }
        };

        const closeOnOutside = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                setOpen(false);
            }
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutside, true);
        window.addEventListener("keydown", handleKeyDown, true);

        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutside, true);
            window.removeEventListener("keydown", handleKeyDown, true);
        };
    }, [open]);

    const panel = open && buttonRect && typeof document !== "undefined" ? (
        createPortal(
            <div
                ref={panelRef}
                role="listbox"
                aria-label="图片语言选择"
                className="canvas-image-settings-popover aceternity-floating-panel backdrop-blur-2xl thin-scrollbar overflow-y-auto overflow-x-hidden animate-in fade-in zoom-in-95 duration-100"
                style={{
                    position: "fixed",
                    zIndex: "var(--z-dialog-popover)",
                    width: Math.max(160, Math.round(buttonRect.width)),
                    left: Math.max(8, Math.min(window.innerWidth - Math.max(160, Math.round(buttonRect.width)) - 8, Math.round(buttonRect.left))),
                    maxHeight: Math.min(320, Math.max(160, (placement === "top" ? buttonRect.top : window.innerHeight - buttonRect.bottom) - 16)),
                    ...(placement === "top"
                        ? { bottom: window.innerHeight - buttonRect.top + 8 }
                        : { top: buttonRect.bottom + 8 }),
                    background: theme.canvas.background,
                    border: `1px solid ${theme.toolbar.border}`,
                    borderRadius: 12,
                    boxShadow: `0 24px 72px ${theme.spatial.shadow}`,
                    padding: 4,
                    color: theme.node.text,
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex flex-col gap-0.5">
                    {ALL_LANGUAGE_OPTIONS.map((opt) => {
                        const isSelected = opt.value === value;
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => {
                                    onChange(opt.value);
                                    setOpen(false);
                                }}
                                className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer text-left ${
                                    isSelected
                                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold"
                                        : "hover:bg-black/5 dark:hover:bg-white/10"
                                }`}
                                style={{
                                    color: isSelected ? undefined : theme.node.text,
                                }}
                            >
                                <span className="flex items-center gap-2">
                                    <Languages className={`size-3.5 ${isSelected ? "text-amber-500" : "opacity-60"}`} />
                                    <span>{opt.label}</span>
                                </span>
                                {isSelected && <Check className="size-3.5 text-amber-500" />}
                            </button>
                        );
                    })}
                </div>
            </div>,
            document.body
        )
    ) : null;

    return (
        <div className={`relative inline-flex min-w-0 ${className || ""}`}>
            <button
                ref={buttonRef}
                type="button"
                aria-expanded={open}
                aria-label={ariaLabel || "图片语言"}
                title={`图片语言：${currentOption.label}`}
                onClick={() => {
                    if (buttonRef.current) {
                        setButtonRect(buttonRef.current.getBoundingClientRect());
                    }
                    setOpen((prev) => !prev);
                }}
                className={`flex items-center justify-between border border-black/[0.08] px-3 text-sm font-medium shadow-sm transition hover:border-black/[0.16] dark:border-white/[0.08] dark:hover:border-white/[0.16] cursor-pointer ${
                    buttonClassName || "!h-[38px] !w-full !rounded-lg"
                }`}
                style={{
                    background: theme.node.fill,
                    color: theme.node.text,
                }}
            >
                <span className="truncate">{currentOption.label}</span>
                <ChevronDown className={`size-4 shrink-0 opacity-60 transition-transform duration-200 ${open ? "rotate-180 opacity-100" : ""}`} />
            </button>
            {panel}
        </div>
    );
}
// @opc-feature: detail_set_workflow [end]
