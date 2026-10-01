// @opc-feature: celadon-dropdown-menu [start]
import {
    Button as AriaButton,
    Menu,
    MenuItem,
    MenuTrigger,
    Popover as AriaPopover,
    Separator,
    type Placement,
} from "react-aria-components";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Celadon DropdownMenu — 自研下拉操作菜单（基于 react-aria-components）。
 *
 * - 彻底根除 Ant Design @rc-component/trigger 的 -1000vw / -8000px 视口外测量与时延竞争 bug。
 * - 0ms 绝对视口定位（Floating UI / RAC Popper），支持全局 Portal 传送至 document.body。
 * - 默认高层级 z-[10050]，确保不被抽屉、模态框、表格横向滚动条裁剪或遮挡。
 * - 严格对齐 AGENTS.md 5.1 节规范：原生支持 Esc 栈式退出（LIFO）与外部点击自动关闭。
 * - 消费 Celadon 设计 Token：bg-surface-strong、border-border/80、text-foreground、shadow-2xl、rounded-xl。
 */

export interface DropdownMenuItem {
    key: string;
    label?: ReactNode;
    icon?: ReactNode;
    danger?: boolean;
    disabled?: boolean;
    divider?: boolean;
    onClick?: () => void | Promise<void>;
}

export interface DropdownMenuProps {
    /** 触发元素，可为任意按钮或节点 */
    trigger: ReactNode;
    /** 声明式菜单项列表（对齐 AntD items） */
    items?: DropdownMenuItem[];
    /** 自定义子菜单内容 */
    children?: ReactNode;
    /** 弹出方位，默认 "bottom end" */
    placement?: Placement;
    /** 浮层偏移像素，默认 4 */
    offset?: number;
    /** 浮层容器类名 */
    className?: string;
    /** 菜单容器类名 */
    menuClassName?: string;
    /** 触发按钮类名 */
    triggerClassName?: string;
    /** 是否禁用触发 */
    disabled?: boolean;
    /** 触发器 aria-label */
    ariaLabel?: string;
    /** 受控展开状态 */
    open?: boolean;
    /** 展开状态变更回调 */
    onOpenChange?: (isOpen: boolean) => void;
}

export function DropdownMenu({
    trigger,
    items,
    children,
    placement = "bottom end",
    offset = 4,
    className,
    menuClassName,
    triggerClassName,
    disabled = false,
    ariaLabel,
    open,
    onOpenChange,
}: DropdownMenuProps) {
    return (
        <MenuTrigger isOpen={open} onOpenChange={onOpenChange}>
            <AriaButton
                className={cn(
                    "inline-flex items-center justify-center outline-none transition-opacity focus-visible:ring-1 focus-visible:ring-primary/40",
                    disabled && "pointer-events-none opacity-50",
                    triggerClassName
                )}
                isDisabled={disabled}
                aria-label={ariaLabel}
            >
                {trigger}
            </AriaButton>
            <AriaPopover
                placement={placement}
                offset={offset}
                className={cn(
                    "dropdown-menu-popover z-[10050] min-w-[136px] rounded-xl border border-border/80 bg-surface-strong p-1 shadow-2xl outline-none backdrop-blur-md",
                    "ra-pop-in animate-in fade-in zoom-in-95 duration-150",
                    className
                )}
            >
                <Menu
                    className={cn("outline-none flex flex-col gap-0.5", menuClassName)}
                    onAction={(key) => {
                        const item = items?.find((i) => i.key === String(key));
                        if (item && !item.disabled) {
                            void item.onClick?.();
                        }
                    }}
                >
                    {items?.map((item) => {
                        if (item.divider) {
                            return <Separator key={item.key} className="my-1 border-t border-border/50" />;
                        }
                        return (
                            <MenuItem
                                key={item.key}
                                id={item.key}
                                isDisabled={item.disabled}
                                className={cn(
                                    "group flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground/80 outline-none transition-colors",
                                    "hover:bg-surface-hover hover:text-foreground focus:bg-surface-hover focus:text-foreground",
                                    "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
                                    item.danger && "text-destructive hover:bg-destructive/10 hover:text-destructive focus:bg-destructive/10 focus:text-destructive"
                                )}
                            >
                                {item.icon ? (
                                    <span className="size-3.5 shrink-0 flex items-center justify-center text-foreground/50 group-hover:text-foreground [&>svg]:size-3.5">
                                        {item.icon}
                                    </span>
                                ) : null}
                                <span className="flex-1 truncate">{item.label}</span>
                            </MenuItem>
                        );
                    })}
                    {children}
                </Menu>
            </AriaPopover>
        </MenuTrigger>
    );
}

export { Separator as DropdownMenuSeparator };
// @opc-feature: celadon-dropdown-menu [end]
