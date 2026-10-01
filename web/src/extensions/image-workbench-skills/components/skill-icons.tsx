import React from "react";
import type { SlotIconType } from "../types/skill-contract";
import {
    Sparkles,
    User,
    ShoppingBag,
    Image as ImageIcon,
    Wand2,
    Home,
    Clapperboard,
    Share2,
    Smile,
    ArrowUp,
    Star,
    Palette,
    Shirt,
} from "lucide-react";

export function CategoryIcon({ name, className = "size-4" }: { name?: string; className?: string }) {
    switch (name) {
        case "recommend":
            return <Star className={className} />;
        case "portrait":
            return <User className={className} />;
        case "ecommerce":
            return <ShoppingBag className={className} />;
        case "scene":
            return <ImageIcon className={className} />;
        case "enhance":
            return <Wand2 className={className} />;
        case "spatial":
            return <Home className={className} />;
        case "cinema":
            return <Clapperboard className={className} />;
        case "oriental":
            return <Palette className={className} />;
        case "social":
            return <Share2 className={className} />;
        default:
            return <Sparkles className={className} />;
    }
}

export function SlotOutlineIcon({ type, className = "size-10 text-stone-400 dark:text-stone-500" }: { type: SlotIconType; className?: string }) {
    switch (type) {
        case "model":
            // 模特人体线框
            return (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    {/* Head */}
                    <circle cx="24" cy="9" r="4.5" />
                    {/* Neck */}
                    <path d="M22 13.5v2h4v-2" />
                    {/* Torso & Shoulders */}
                    <path d="M16 19c2-2.5 5.5-3.5 8-3.5s6 1 8 3.5l1.5 8c.2 1.2-.7 2.2-1.9 2.2H16.4c-1.2 0-2.1-1-1.9-2.2l1.5-8z" />
                    {/* Waist & Hips */}
                    <path d="M17.5 29.2l-.7 4.8c-.2 1.3.7 2.5 2 2.5h10.4c1.3 0 2.2-1.2 2-2.5l-.7-4.8" />
                    {/* Legs */}
                    <path d="M20 36.5v8M28 36.5v8" />
                </svg>
            );

        case "top":
            // 上衣/T恤线框
            return (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <path d="M18 10a6 6 0 0 0 12 0l7 3.5 3 6-4 2-3-3v21a2 2 0 0 1-2 2H17a2 2 0 0 1-2-2V18.5l-3 3-4-2 3-6 7-3.5z" />
                    <path d="M18 10c0 3.3 2.7 5.5 6 5.5s6-2.2 6-5.5" />
                </svg>
            );

        case "bottom":
            // 下装/裤子线框
            return (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <path d="M14 9h20l-1.5 29a1.5 1.5 0 0 1-1.5 1.4h-5.5a1.5 1.5 0 0 1-1.5-1.4l-1-16-1 16a1.5 1.5 0 0 1-1.5 1.4h-5.5A1.5 1.5 0 0 1 15 38L14 9z" />
                    <path d="M14 15h20" strokeDasharray="2 2" />
                </svg>
            );

        case "face":
            // 人脸五官轮廓
            return (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    {/* Face oval */}
                    <path d="M15 19c0-5 4-10 9-10s9 5 9 10c0 7-3.5 14-9 16-5.5-2-9-9-9-16z" />
                    {/* Hair strands */}
                    <path d="M14 17c1.5-5 5-8 10-8s8.5 3 10 8" />
                    <path d="M12 25c0-4 1.5-9 3-11" />
                    <path d="M36 25c0-4-1.5-9-3-11" />
                    {/* Shoulders */}
                    <path d="M13 41c1.5-4 5-6.5 11-6.5s9.5 2.5 11 6.5" />
                </svg>
            );

        case "product":
            // 化妆品/瓶身产品线框
            return (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    {/* Bottle Cap */}
                    <rect x="20" y="8" width="8" height="6" rx="1.5" />
                    <rect x="22" y="6" width="4" height="2" rx="0.5" />
                    {/* Bottle Body */}
                    <rect x="17" y="14" width="14" height="26" rx="3" />
                    {/* Product label line */}
                    <line x1="21" y1="24" x2="27" y2="24" strokeWidth="1.2" />
                    <line x1="22" y1="28" x2="26" y2="28" strokeWidth="1.2" />
                    {/* Base shadow reflection line */}
                    <ellipse cx="24" cy="42" rx="9" ry="2" strokeDasharray="2 2" />
                </svg>
            );

        case "background":
            // 风景与场景线框
            return (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <rect x="8" y="10" width="32" height="28" rx="3" />
                    <circle cx="16" cy="18" r="3" />
                    <path d="M9 32l9-9 7 7 6-6 8 8" />
                </svg>
            );

        case "fabric":
            // 布料面料纹理
            return (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <rect x="10" y="10" width="28" height="28" rx="2" />
                    <path d="M10 24h28M24 10v28M17 10l14 28M31 10L17 38" strokeDasharray="2 2" />
                </svg>
            );

        case "print":
            // 印花图案样板
            return (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <rect x="10" y="10" width="28" height="28" rx="2" />
                    <path d="M24 15l3 6 6 1-4.5 4.5 1 6.5-5.5-3.5-5.5 3.5 1-6.5L15 22l6-1 3-6z" />
                </svg>
            );

        case "room":
            // 空间与房间透视线框
            return (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <rect x="8" y="8" width="32" height="32" rx="2" />
                    <rect x="15" y="15" width="18" height="18" />
                    <path d="M8 8l7 7M40 8l-7 7M8 40l7-7M40 40l-7-7" />
                    <path d="M20 19h8v10h-8z" strokeDasharray="1.5 1.5" />
                </svg>
            );

        case "furniture":
            // 家具沙发线框
            return (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    {/* Sofa back */}
                    <path d="M10 18c0-3 2-5 5-5h18c3 0 5 2 5 5v13H10V18z" />
                    {/* Left & Right Armrests */}
                    <rect x="7" y="22" width="6" height="12" rx="2" />
                    <rect x="35" y="22" width="6" height="12" rx="2" />
                    {/* Cushion */}
                    <rect x="13" y="26" width="22" height="8" rx="1.5" />
                    {/* Legs */}
                    <path d="M12 36l-2 5M36 36l2 5" />
                </svg>
            );

        case "tile":
            // 地墙砖铺贴网格
            return (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <rect x="9" y="9" width="30" height="30" rx="2" />
                    <line x1="9" y1="24" x2="39" y2="24" strokeWidth="1.8" />
                    <line x1="24" y1="9" x2="24" y2="39" strokeWidth="1.8" />
                    <circle cx="16.5" cy="16.5" r="1.5" fill="currentColor" fillOpacity="0.4" />
                    <circle cx="31.5" cy="31.5" r="1.5" fill="currentColor" fillOpacity="0.4" />
                </svg>
            );

        case "material":
            // 材质样板微距
            return (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <rect x="10" y="10" width="28" height="28" rx="3" />
                    <path d="M14 34c4-6 9-8 15-7s6 5 9 1" strokeDasharray="2 2" />
                    <path d="M11 23c6-3 12-2 18 3s6 2 9-1" />
                    <path d="M13 14l22 22" strokeWidth="1.2" strokeDasharray="1.5 1.5" />
                </svg>
            );

        case "craft":
            // 传统工艺纹样
            return (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <path d="M24 8l11 11-11 11-11-11 11-11z" />
                    <circle cx="24" cy="19" r="4.5" />
                    <path d="M24 30v10M19 40h10" />
                </svg>
            );

        case "character":
            // 角色全身线框
            return (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <circle cx="24" cy="8" r="4" />
                    <path d="M18 16c2-1.5 4-2 6-2s4 .5 6 2l3 9-3 2-2-4v17h-8V23l-2 4-3-2 3-9z" />
                </svg>
            );

        default:
            return (
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
                    <rect x="10" y="10" width="28" height="28" rx="3" />
                    <path d="M24 18v12M18 24h12" />
                </svg>
            );
    }
}

export function SlotUploadBadge({ className = "absolute bottom-1 right-1" }: { className?: string }) {
    return (
        <div className={`flex size-4 items-center justify-center rounded-full bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-900 ${className}`}>
            <ArrowUp className="size-2.5 stroke-[2.5]" />
        </div>
    );
}

export function SkillBadgeIcon({ type, className = "size-3.5" }: { type?: string; className?: string }) {
    switch (type) {
        case "smile":
            return <Smile className={className} />;
        case "sparkles":
            return <Sparkles className={className} />;
        case "shopping-bag":
            return <ShoppingBag className={className} />;
        case "shirt":
            return <Shirt className={className} />;
        default:
            return <ImageIcon className={className} />;
    }
}
