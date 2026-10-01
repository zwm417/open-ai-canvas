import { Blocks, CircleDollarSign, Clapperboard, ImagePlus, Images, LibraryBig, ListTodo, PanelsTopLeft, Settings, Sparkles, Video, WandSparkles } from "lucide-react";

export const navigationTools = [
    {
        slug: "create",
        label: "创作",
        icon: WandSparkles,
        section: "创作空间",
    },
    // @opc-feature: workbench-navigation [start]
    {
        slug: "image",
        label: "生图工作台",
        icon: ImagePlus,
        section: "创作空间",
    },
    {
        slug: "video",
        label: "生视频工作台",
        icon: Video,
        section: "创作空间",
    },
    // @opc-feature: workbench-navigation [end]
    {
        slug: "projects",
        label: "短剧创作",
        icon: Clapperboard,
        section: "创作空间",
    },
    {
        slug: "canvas",
        label: "画布",
        icon: PanelsTopLeft,
        section: "创作空间",
    },
    {
        slug: "tasks",
        label: "任务",
        icon: ListTodo,
        section: "创作空间",
    },
    {
        slug: "assets",
        label: "素材",
        icon: Images,
        section: "创作空间",
    },
    // @opc-feature: prompt-library-nav [start]
    {
        slug: "prompts",
        label: "创作灵感",
        icon: Sparkles,
        section: "创作空间",
    },
    // @opc-feature: prompt-library-nav [end]
    {
        slug: "skills",
        label: "技能库",
        icon: LibraryBig,
        section: "工作台管理",
    },
    {
        slug: "plugins",
        label: "插件中心",
        icon: Blocks,
        section: "工作台管理",
    },
    {
        slug: "wallet",
        label: "积分中心",
        icon: CircleDollarSign,
        section: "工作台管理",
    },
    {
        slug: "settings",
        label: "设置",
        icon: Settings,
        section: "工作台管理",
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
