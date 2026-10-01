const workspaceRouteLoaders = {
    assets: () => import("@/pages/assets"),
    canvas: () => import("@/pages/canvas"),
    create: () => import("@/pages/create"),
    projects: () => import("@/pages/projects"),
    projectDetail: () => import("@/pages/projects/detail"),
    // @opc-feature: extended-workspace-route-loaders [start]
    image: () => import("@/pages/image"),
    video: () => import("@/pages/video"),
    prompts: () => import("@/pages/prompts"),
    tasks: () => import("@/pages/tasks"),
    skills: () => import("@/pages/skills"),
    plugins: () => import("@/pages/plugins"),
    settings: () => import("@/pages/settings"),
    // @opc-feature: extended-workspace-route-loaders [end]
};

export const loadAssetsPage = workspaceRouteLoaders.assets;
export const loadCanvasPage = workspaceRouteLoaders.canvas;
export const loadCanvasProjectPage = () => import("@/pages/canvas/project");
export const loadCreatePage = workspaceRouteLoaders.create;
export const loadProjectDetailPage = workspaceRouteLoaders.projectDetail;
export const loadProjectsPage = workspaceRouteLoaders.projects;
// @opc-feature: extended-workspace-route-loaders [start]
export const loadImagePage = workspaceRouteLoaders.image;
export const loadVideoPage = workspaceRouteLoaders.video;
export const loadPromptsPage = workspaceRouteLoaders.prompts;
export const loadTasksPage = workspaceRouteLoaders.tasks;
export const loadSkillsPage = workspaceRouteLoaders.skills;
export const loadPluginsPage = workspaceRouteLoaders.plugins;
export const loadSettingsPage = workspaceRouteLoaders.settings;
// @opc-feature: extended-workspace-route-loaders [end]

export function preloadWorkspaceRoute(pathnameOrSlug: string) {
    // 根路径就是创作页，预加载时仍映射到其内部模块名。
    const segments = pathnameOrSlug.replace(/^\//, "").split("/").filter(Boolean);
    const slug = segments[0] || "create";
    if (slug === "canvas" && segments.length > 1) {
        void loadCanvasProjectPage();
        return;
    }
    if (slug === "projects" && segments.length > 1) {
        void workspaceRouteLoaders.projectDetail();
        return;
    }
    const load = workspaceRouteLoaders[slug as keyof typeof workspaceRouteLoaders];
    if (load) void load();
}
