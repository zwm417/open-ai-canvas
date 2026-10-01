import React, { useState, useEffect, useRef } from "react";
import { ChevronDown, Globe, Clock } from "lucide-react";
import { InputNumber, Slider } from "antd";

interface DirectorLanguageDurationPopoverProps {
    language: "zh" | "en";
    durationSec: number;
    onLanguageChange: (lang: "zh" | "en") => void;
    onDurationChange: (sec: number) => void;
}

const DURATION_PRESETS = [15, 30, 60, 90, 120];

export const DirectorLanguageDurationPopover: React.FC<DirectorLanguageDurationPopoverProps> = ({
    language,
    durationSec,
    onLanguageChange,
    onDurationChange,
}) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                setOpen(false);
            }
        };
        const handlePointerDown = (event: PointerEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown, true);
        document.addEventListener("pointerdown", handlePointerDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
            document.removeEventListener("pointerdown", handlePointerDown);
        };
    }, [open]);

    const langLabel = language === "zh" ? "中文" : "English";

    return (
        <div ref={containerRef} className="relative inline-block">
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className="flex items-center gap-1.5 rounded-lg border border-stone-200/80 bg-stone-50/80 px-2.5 py-1 text-xs font-medium text-stone-700 hover:border-amber-400 hover:bg-amber-50/50 hover:text-amber-900 dark:border-stone-700 dark:bg-[#2c2c2e] dark:text-stone-300 dark:hover:bg-[#343438] transition-all cursor-pointer"
            >
                <span className="font-serif font-bold text-[11px] text-amber-600 dark:text-amber-400">文A</span>
                <span>{langLabel} · {durationSec}s</span>
                <ChevronDown className="size-3 text-stone-400" />
            </button>

            {open && (
                <div className="absolute left-0 bottom-full mb-2 z-50 w-72 rounded-2xl border border-black/[0.08] bg-white p-4 shadow-xl animate-in fade-in zoom-in-95 duration-150 dark:border-white/[0.08] dark:bg-[#1c1c1e] text-stone-900 dark:text-stone-100">
                    <div className="flex flex-col gap-3.5">
                        {/* 语言选择 */}
                        <div>
                            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                                <Globe className="size-3 text-amber-500" />
                                <span>输出语言</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => onLanguageChange("zh")}
                                    className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                                        language === "zh"
                                            ? "border border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-600/80 dark:bg-amber-950/40 dark:text-amber-200 font-bold shadow-2xs"
                                            : "border border-stone-200/80 bg-stone-50 text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:bg-[#2c2c2e] dark:text-stone-300"
                                    }`}
                                >
                                    中文
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onLanguageChange("en")}
                                    className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                                        language === "en"
                                            ? "border border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-600/80 dark:bg-amber-950/40 dark:text-amber-200 font-bold shadow-2xs"
                                            : "border border-stone-200/80 bg-stone-50 text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:bg-[#2c2c2e] dark:text-stone-300"
                                    }`}
                                >
                                    English
                                </button>
                            </div>
                        </div>

                        {/* 视频时长 */}
                        <div>
                            <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-stone-600 dark:text-stone-300">
                                <div className="flex items-center gap-1.5">
                                    <Clock className="size-3 text-amber-500" />
                                    <span>目标成片时长</span>
                                </div>
                                <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">{durationSec}s</span>
                            </div>

                            {/* 滑动选择条 */}
                            <div className="px-1.5 pt-1 pb-2">
                                <Slider
                                    min={5}
                                    max={120}
                                    step={1}
                                    value={durationSec}
                                    onChange={(val) => onDurationChange(val)}
                                    marks={{
                                        5: "5s",
                                        15: "15s",
                                        30: "30s",
                                        60: "60s",
                                        120: "120s",
                                    }}
                                    className="!my-2"
                                />
                            </div>

                            {/* 快捷预设按钮组 */}
                            <div className="flex flex-wrap gap-1.5 mb-2 mt-1">
                                {DURATION_PRESETS.map((sec) => (
                                    <button
                                        key={sec}
                                        type="button"
                                        onClick={() => onDurationChange(sec)}
                                        className={`rounded-lg px-2 py-1 text-xs font-medium transition-all cursor-pointer ${
                                            durationSec === sec
                                                ? "border border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-600/80 dark:bg-amber-950/40 dark:text-amber-200 font-bold shadow-2xs"
                                                : "border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-[#2c2c2e] dark:text-stone-300"
                                        }`}
                                    >
                                        {sec}s
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-2 mt-2">
                                <span className="text-xs text-stone-500">精确微调:</span>
                                <InputNumber
                                    size="small"
                                    min={5}
                                    max={300}
                                    value={durationSec}
                                    onChange={(val) => onDurationChange(val || 15)}
                                    addonAfter="秒"
                                    className="!w-28"
                                />
                            </div>
                            <p className="mt-2 text-[10px] text-stone-400 leading-tight">
                                将根据模型能力自动规划分段镜头与承接生成
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
