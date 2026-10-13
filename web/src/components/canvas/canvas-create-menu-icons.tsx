// @opc-feature: canvas-create-menu-redesign [start]
import type { ReactNode } from "react";

export function CreateTextIcon({ className = "size-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`text-[#22c7d9] ${className}`}>
            <path d="M4 6V4h16v2M12 4v16M8 20h8" />
        </svg>
    );
}

export function CreateImageIcon({ className = "size-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`text-[#a855f7] ${className}`}>
            <rect width="18" height="18" x="3" y="3" rx="3.5" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
        </svg>
    );
}

export function CreateVideoIcon({ className = "size-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`text-[#20b7d6] ${className}`}>
            <rect width="14" height="12" x="2" y="6" rx="3" />
            <path d="m16 10 5-3.5v11L16 14v-4z" />
        </svg>
    );
}

export function CreateAudioIcon({ className = "size-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-[#e4b63e] ${className}`}>
            <circle cx="8" cy="18" r="3" />
            <path d="M11 18V5l10-2v13" />
            <circle cx="18" cy="16" r="3" />
        </svg>
    );
}

export function CreateScriptIcon({ className = "size-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`text-[#26c48b] ${className}`}>
            <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5z" />
            <path d="m4 8 16 0M4 12l16 0M8 3l3 5M14 3l3 5" />
        </svg>
    );
}

export function CreateCharacterIcon({ className = "size-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={`text-[#e15b9a] ${className}`}>
            <circle cx="12" cy="8" r="4" />
            <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
        </svg>
    );
}

export function CreateDirectorIcon({ className = "size-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`text-[#6f78ff] ${className}`}>
            <path d="m12 2 10 5-10 5L2 7l10-5z" />
            <path d="m2 12 10 5 10-5" />
            <path d="m2 17 10 5 10-5" />
        </svg>
    );
}

export function CreateDrawingIcon({ className = "size-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={`text-[#e48a35] ${className}`}>
            <path d="m18 2 4 4-12 12H6v-4L18 2z" />
            <path d="m14 6 4 4" />
        </svg>
    );
}

export function CreateStyleIcon({ className = "size-4" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`text-[#f59e0b] ${className}`}>
            <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
            <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
            <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
            <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.2 0-.9.8-1.7 1.7-1.7H17c2.8 0 5-2.2 5-5 0-6.1-4.5-9.3-10-9.3z" />
        </svg>
    );
}

export function CreateFrameIcon({ className = "size-4" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`text-[#94a3b8] ${className}`}>
            <rect width="18" height="18" x="3" y="3" rx="2.5" />
            <path d="M3 9h18" />
        </svg>
    );
}

export function CreateWorkflowIcon({ className = "size-4" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`text-[#4e9fe7] ${className}`}>
            <rect width="7" height="6" x="2" y="4" rx="1.5" />
            <rect width="7" height="6" x="15" y="14" rx="1.5" />
            <path d="M5.5 10v4a2 2 0 0 0 2 2h7.5" />
        </svg>
    );
}

export function CreateUploadIcon({ className = "size-4" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={`text-[#27b77b] ${className}`}>
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            <path d="m16 9-4-4-4 4" />
            <path d="M12 5v12" />
        </svg>
    );
}

export function CreateAssetsIcon({ className = "size-4" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`text-[#cfb33f] ${className}`}>
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            <path d="M2 10h20" />
        </svg>
    );
}

export function CreateAssetTableIcon({ className = "size-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`text-[#14b8a6] ${className}`}>
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M3 9h18M3 15h18M9 3v18" />
        </svg>
    );
}

export function CreateVoiceTableIcon({ className = "size-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={`text-[#f59e0b] ${className}`}>
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
    );
}

export function CreateStoryboardTableIcon({ className = "size-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`text-[#6366f1] ${className}`}>
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M3 9h18M3 15h18M15 3v18" />
        </svg>
    );
}

export function CreateVideoReverseIcon({ className = "size-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={`text-[#d946ef] ${className}`}>
            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
            <path d="m20 3-1 2-2 1 2 1 1 2 1-2 2-1-2-1Z" />
        </svg>
    );
}

export function CreateAnalysisIcon({ className = "size-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={`text-[#0ea5e9] ${className}`}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
            <path d="M11 8v6M8 11h6" />
        </svg>
    );
}

export function CreateScriptGenIcon({ className = "size-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`text-[#10b981] ${className}`}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <path d="m10 13 4 4M14 13l-4 4" />
        </svg>
    );
}

export function CreateRefScriptIcon({ className = "size-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`text-[#f43f5e] ${className}`}>
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
            <path d="M8 7h8M8 11h8M8 15h5" />
        </svg>
    );
}

export function CreateFolderIcon({ className = "size-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`text-[#f59e0b] ${className}`}>
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </svg>
    );
}

export function CreateMediaConversionIcon({ className = "size-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={`text-[#a855f7] ${className}`}>
            <path d="m15 4-2 4 4 2-4 2 2 4-4-2-2 4-2-4-4 2 2-4-4-2 4-2-2-4 4 2 2-4 2 4Z" />
        </svg>
    );
}

export function CreateBatchTableIcon({ className = "size-5" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`text-[#8b5cf6] ${className}`}>
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
        </svg>
    );
}

export function getCanvasCreateMenuIcon(commandId: string, fallback: ReactNode, sizeClass = "size-5"): ReactNode {
    switch (commandId) {
        case "text":
            return <CreateTextIcon className={sizeClass} />;
        case "image":
            return <CreateImageIcon className={sizeClass} />;
        case "video":
            return <CreateVideoIcon className={sizeClass} />;
        case "audio":
            return <CreateAudioIcon className={sizeClass} />;
        case "script":
            return <CreateScriptIcon className={sizeClass} />;
        case "project-character":
            return <CreateCharacterIcon className={sizeClass} />;
        case "director":
            return <CreateDirectorIcon className={sizeClass} />;
        case "drawing":
            return <CreateDrawingIcon className={sizeClass} />;
        case "style":
            return <CreateStyleIcon className={sizeClass} />;
        case "frame":
            return <CreateFrameIcon className={sizeClass} />;
        case "workflow":
            return <CreateWorkflowIcon className={sizeClass} />;
        case "upload":
            return <CreateUploadIcon className={sizeClass} />;
        case "assets":
            return <CreateAssetsIcon className={sizeClass} />;
        case "creative-asset-table":
            return <CreateAssetTableIcon className={sizeClass} />;
        case "creative-voice-table":
            return <CreateVoiceTableIcon className={sizeClass} />;
        case "creative-storyboard-table":
            return <CreateStoryboardTableIcon className={sizeClass} />;
        case "video-reverse":
            return <CreateVideoReverseIcon className={sizeClass} />;
        case "creation-assistant-analysis":
            return <CreateAnalysisIcon className={sizeClass} />;
        case "creation-assistant-script":
            return <CreateScriptGenIcon className={sizeClass} />;
        case "creation-assistant-ref-script":
            return <CreateRefScriptIcon className={sizeClass} />;
        case "folder":
            return <CreateFolderIcon className={sizeClass} />;
        case "media-conversion":
            return <CreateMediaConversionIcon className={sizeClass} />;
        case "batch-table":
            return <CreateBatchTableIcon className={sizeClass} />;
        default:
            return fallback;
    }
}
// @opc-feature: canvas-create-menu-redesign [end]
