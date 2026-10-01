import React, { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CanvasNodeData } from "@/types/canvas";

type CanvasNodeErrorBoundaryProps = {
    node: CanvasNodeData;
    theme?: CanvasTheme;
    children: ReactNode;
};

type CanvasNodeErrorBoundaryState = {
    hasError: boolean;
    error?: Error;
};

export class CanvasNodeErrorBoundary extends Component<CanvasNodeErrorBoundaryProps, CanvasNodeErrorBoundaryState> {
    state: CanvasNodeErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(error: Error): CanvasNodeErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error(
            `[CanvasNodeErrorBoundary] Node ${this.props.node.id} (${this.props.node.type}) failed to render:`,
            error,
            errorInfo
        );
    }

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        const { node, theme } = this.props;
        const textColor = theme?.node?.text || "#e2e8f0";
        const strokeColor = theme?.node?.stroke || "rgba(239, 68, 68, 0.4)";
        const bgColor = theme?.node?.fill || "rgba(24, 24, 27, 0.95)";

        return (
            <div
                className="flex size-full flex-col items-center justify-center p-4 text-center select-none rounded-[inherit] overflow-hidden"
                style={{
                    background: bgColor,
                    border: `1px dashed ${strokeColor}`,
                    color: textColor,
                }}
                role="alert"
                aria-label={`${node.title || "节点"}渲染异常`}
            >
                <AlertCircle className="size-8 text-rose-400 mb-2 opacity-80 shrink-0" />
                <div className="text-xs font-semibold text-rose-300 truncate max-w-full">
                    {node.title || "画布节点"} 渲染异常
                </div>
                <div
                    className="text-[10px] text-stone-400 mt-1 max-w-[220px] line-clamp-2 break-all"
                    title={this.state.error?.message}
                >
                    {this.state.error?.message || "组件渲染过程出现异常"}
                </div>
                <button
                    type="button"
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 text-[11px] rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition-colors"
                    onClick={(e) => {
                        e.stopPropagation();
                        this.setState({ hasError: false, error: undefined });
                    }}
                >
                    <RefreshCw className="size-3" />
                    重试渲染
                </button>
            </div>
        );
    }
}
