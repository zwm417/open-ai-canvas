import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeName = "light" | "dark";

type ThemeStore = {
    theme: ThemeName;
    setTheme: (theme: ThemeName) => void;
};

const VALID_THEMES: ThemeName[] = ["light", "dark"];

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: "light",
            // 写入前校验：非法 theme 直接忽略，防止 syncRemoteUserData 等路径绕过 merge 写入坏值
            setTheme: (next) => {
                if (!VALID_THEMES.includes(next)) return;
                // @opc-feature: desktop-theme-sync [start]
                if (typeof window !== "undefined" && (window as any).desktopBridge?.setTheme) {
                    (window as any).desktopBridge.setTheme(next);
                }
                // @opc-feature: desktop-theme-sync [end]
                set({ theme: next });
            },
        }),
        {
            name: "infinite-canvas:theme_store",
            // 持久化恢复校验：旧版本/坏 session 写入的非法值回退到 light，
            // 避免 canvasThemes[非法值] = undefined 触发 "reading 'node'" 崩溃
            merge: (persisted, current) => {
                const stored = (persisted || {}) as Partial<ThemeStore>;
                const theme = VALID_THEMES.includes(stored.theme as ThemeName)
                    ? (stored.theme as ThemeName)
                    : "light";
                return { ...current, theme };
            },
        },
    ),
);

// @opc-feature: desktop-theme-listener [start]
if (typeof window !== "undefined" && (window as any).desktopBridge?.onThemeChanged) {
    (window as any).desktopBridge.onThemeChanged((theme: ThemeName) => {
        if (VALID_THEMES.includes(theme)) {
            useThemeStore.setState({ theme });
        }
    });
}
// @opc-feature: desktop-theme-listener [end]
