import { useId } from "react";
import "./pixiu-pet.css";

export type PixiuMood = "idle" | "working" | "attention";

// 原创手绘 Q 版貔貅：纯 SVG + CSS 动画的轻量桌宠形象（无素材下载、无运行时依赖），
// 作为画布 Agent 悬浮入口的第三种形象与 FluidOrb / Live2D 并列。
// 装饰性微动画刻意不受 prefers-reduced-motion 降级影响：桌宠的生命力就是动效本身，
// 且系统开启"减弱动效"的机器上连 FluidOrb 都只剩静帧，这里必须保持常动。
export function PixiuPet({ size = 64, mood = "idle" }: { size?: number; mood?: PixiuMood }) {
    // 同页可能存在多只（管理后台预览 + 画布入口），渐变 id 必须按实例隔离。
    const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
    const fill = (name: string) => `url(#pixiu-${uid}-${name})`;
    const moodClass = mood === "idle" ? "" : ` pixiu-pet--${mood}`;
    return (
        <svg className={`pixiu-pet${moodClass}`} width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" focusable="false">
            <defs>
                <linearGradient id={`pixiu-${uid}-body`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#FCD98A" />
                    <stop offset="1" stopColor="#EFA43B" />
                </linearGradient>
                <linearGradient id={`pixiu-${uid}-horn`} x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0" stopColor="#F0B24A" />
                    <stop offset="1" stopColor="#FFE7A0" />
                </linearGradient>
                <linearGradient id={`pixiu-${uid}-coin`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#FFDF75" />
                    <stop offset="1" stopColor="#F2B33D" />
                </linearGradient>
                <linearGradient id={`pixiu-${uid}-wing`} x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0" stopColor="#F6C65E" />
                    <stop offset="1" stopColor="#FFEDB5" />
                </linearGradient>
            </defs>
            <ellipse className="pi-shadow" cx="48" cy="91.5" rx="15" ry="2.6" fill="#3A2A10" opacity=".8" />
            <g className="pi-float">
                <g className="pi-pet">
                    <g className="pi-hop">
                        <g className="pi-breath">
                        {/* tail (left side) */}
                        <g className="pi-tail">
                            <path d="M31 80 C 22 84, 13 80, 11.5 72.5 C 10.8 68.6, 13.2 66.4, 15.8 67.2" fill="none" stroke="#9A6418" strokeWidth="2.4" strokeLinecap="round" />
                            <path d="M31 80 C 22 84, 13 80, 11.5 72.5 C 10.8 68.6, 13.2 66.4, 15.8 67.2" fill="none" stroke="#F2AE45" strokeWidth="1.4" strokeLinecap="round" />
                            <circle cx="13.6" cy="65.6" r="4.6" fill={fill("body")} stroke="#9A6418" strokeWidth="2" />
                            <circle cx="13.6" cy="65.6" r="2" fill="#FFDF8C" />
                        </g>
                        {/* wings (high, beside head) */}
                        <g className="pi-wing pi-wing--l">
                            <path d="M27 55 C 15.5 49.5, 13.5 38.5, 19 31.5 C 22.5 38.5, 27 44, 33 47.5 Z" fill={fill("wing")} stroke="#9A6418" strokeWidth="2.2" strokeLinejoin="round" />
                        </g>
                        <g className="pi-wing pi-wing--r">
                            <path d="M69 55 C 80.5 49.5, 82.5 38.5, 77 31.5 C 73.5 38.5, 69 44, 63 47.5 Z" fill={fill("wing")} stroke="#9A6418" strokeWidth="2.2" strokeLinejoin="round" />
                        </g>
                        {/* body */}
                        <ellipse cx="48" cy="72.5" rx="21" ry="17" fill={fill("body")} stroke="#9A6418" strokeWidth="2.4" />
                        <ellipse cx="48" cy="77" rx="12.8" ry="10.2" fill="#FFF3D2" />
                        {/* feet */}
                        <ellipse cx="38.5" cy="87.5" rx="6.6" ry="4.6" fill={fill("body")} stroke="#9A6418" strokeWidth="2.2" />
                        <ellipse cx="57.5" cy="87.5" rx="6.6" ry="4.6" fill={fill("body")} stroke="#9A6418" strokeWidth="2.2" />
                        {/* left arm resting */}
                        <path d="M30.5 68 C 27.5 71.5, 28 75.5, 32 77" fill="none" stroke="#9A6418" strokeWidth="2.2" strokeLinecap="round" />
                        {/* coin (right paw) */}
                        <g className="pi-coin">
                            <circle cx="76.5" cy="53.5" r="8" fill={fill("coin")} stroke="#B27714" strokeWidth="2" />
                            <rect x="73.8" y="50.8" width="5.4" height="5.4" rx="0.8" fill="#FFF3D2" stroke="#B27714" strokeWidth="1.6" />
                            <path d="M71.8 49.2 C 72.6 47.9, 74 47, 75.5 46.7" fill="none" stroke="#FFF3D2" strokeWidth="1.6" strokeLinecap="round" opacity=".9" />
                        </g>
                        <path d="M63 68.5 C 64.5 65, 68 62.5, 71.5 62" fill="none" stroke="#9A6418" strokeWidth="2.2" strokeLinecap="round" />
                        <circle cx="72.5" cy="61.5" r="3.4" fill={fill("body")} stroke="#9A6418" strokeWidth="2" />
                        {/* ears */}
                        <circle cx="27" cy="21.5" r="8.2" fill={fill("body")} stroke="#9A6418" strokeWidth="2.4" />
                        <circle cx="27" cy="22.5" r="3.6" fill="#F8CFA6" />
                        <circle cx="69" cy="21.5" r="8.2" fill={fill("body")} stroke="#9A6418" strokeWidth="2.4" />
                        <circle cx="69" cy="22.5" r="3.6" fill="#F8CFA6" />
                        {/* horn */}
                        <path d="M41.5 20 C 42.5 12.5, 45 6.5, 48.5 3.5 C 52 6.5, 54.5 12.5, 55.5 20 C 51.5 18, 45.5 18, 41.5 20 Z" fill={fill("horn")} stroke="#9A6418" strokeWidth="2.2" strokeLinejoin="round" />
                        {/* head */}
                        <ellipse cx="48" cy="40" rx="26" ry="23.5" fill={fill("body")} stroke="#9A6418" strokeWidth="2.4" />
                        {/* forehead curl */}
                        <path d="M40 24.5 C 43 22.5, 45 22.2, 48 22.2 C 51 22.2, 53 22.5, 56 24.5" fill="none" stroke="#C98324" strokeWidth="1.8" strokeLinecap="round" opacity=".8" />
                        {/* eyes */}
                        <g className="pi-eyes">
                            <ellipse cx="38.5" cy="42" rx="4.8" ry="5.6" fill="#FFFDF6" stroke="#9A6418" strokeWidth="1.6" />
                            <ellipse cx="57.5" cy="42" rx="4.8" ry="5.6" fill="#FFFDF6" stroke="#9A6418" strokeWidth="1.6" />
                            <g className="pi-pupils">
                                <circle cx="39.4" cy="42.8" r="2.9" fill="#43290E" />
                                <circle cx="58.4" cy="42.8" r="2.9" fill="#43290E" />
                                <circle cx="38.2" cy="41.2" r="1.1" fill="#FFFFFF" />
                                <circle cx="57.2" cy="41.2" r="1.1" fill="#FFFFFF" />
                            </g>
                        </g>
                        {/* brows */}
                        <path d="M34.5 34.6 C 36.5 33.4, 39 33.3, 41.5 34.2" fill="none" stroke="#9A6418" strokeWidth="1.8" strokeLinecap="round" />
                        <path d="M54.5 34.2 C 57 33.3, 59.5 33.4, 61.5 34.6" fill="none" stroke="#9A6418" strokeWidth="1.8" strokeLinecap="round" />
                        {/* blush */}
                        <ellipse cx="30.5" cy="50" rx="4.8" ry="3" fill="#F79A5C" opacity=".6" />
                        <ellipse cx="65.5" cy="50" rx="4.8" ry="3" fill="#F79A5C" opacity=".6" />
                        {/* nose + mouth */}
                        <path d="M46.2 48.4 C 47.3 47.3, 48.7 47.3, 49.8 48.4 C 49.8 49.7, 48.9 50.5, 48 50.5 C 47.1 50.5, 46.2 49.7, 46.2 48.4 Z" fill="#7A4A16" />
                        <path className="pi-mouth-smile" d="M43.2 53.2 C 45.6 56.4, 50.4 56.4, 52.8 53.2" fill="none" stroke="#7A4A16" strokeWidth="2" strokeLinecap="round" />
                        <g className="pi-mouth-open">
                            <path d="M43.8 52.6 C 46.2 59.4, 49.8 59.4, 52.2 52.6 C 49.5 54, 46.5 54, 43.8 52.6 Z" fill="#7A4A16" />
                            <path d="M46.4 56.2 C 47.4 57.2, 48.6 57.2, 49.6 56.2 C 48.9 55.7, 47.1 55.7, 46.4 56.2 Z" fill="#F0806C" />
                        </g>
                        {/* 吐金币（三枚大铜钱从嘴角连续蹦出，转身时自动跟随镜像） */}
                        <g className="pi-spit pi-spit--a">
                            <circle cx="51" cy="54" r="9" fill={fill("coin")} stroke="#B27714" strokeWidth="2.2" />
                            <rect x="48.2" y="51.2" width="5.6" height="5.6" fill="#FFF3D2" stroke="#B27714" strokeWidth="1.5" />
                        </g>
                        <g className="pi-spit pi-spit--b">
                            <circle cx="51" cy="54" r="9" fill={fill("coin")} stroke="#B27714" strokeWidth="2.2" />
                            <rect x="48.2" y="51.2" width="5.6" height="5.6" fill="#FFF3D2" stroke="#B27714" strokeWidth="1.5" />
                        </g>
                        <g className="pi-spit pi-spit--c">
                            <circle cx="51" cy="54" r="9" fill={fill("coin")} stroke="#B27714" strokeWidth="2.2" />
                            <rect x="48.2" y="51.2" width="5.6" height="5.6" fill="#FFF3D2" stroke="#B27714" strokeWidth="1.5" />
                        </g>
                        {/* sparkles (working mood) */}
                        <g className="pi-spark">
                            <path d="M80 13 L 81.6 18.4 L 87 20 L 81.6 21.6 L 80 27 L 78.4 21.6 L 73 20 L 78.4 18.4 Z" fill="#FFD34D" stroke="#C98A1E" strokeWidth="1.4" strokeLinejoin="round" />
                            <path d="M88.5 28.5 L 89.3 31.2 L 92 32 L 89.3 32.8 L 88.5 35.5 L 87.7 32.8 L 85 32 L 87.7 31.2 Z" fill="#FFD34D" stroke="#C98A1E" strokeWidth="1.1" strokeLinejoin="round" />
                        </g>
                        </g>
                    </g>
                </g>
            </g>
        </svg>
    );
}
