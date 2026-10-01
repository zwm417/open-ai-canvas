import type { CreationAssistantPlatform, CreationAssistantScriptType, CreationAssistantShootingStyle } from "@/lib/creation-assistant-catalog";

export type VideoSkillCategory = {
    id: string;
    name: string;
    iconName?: string;
    order?: number;
};

export type VideoWorkbenchSkill = {
    id: string;
    categoryId: string;
    secondaryCategoryIds?: string[];
    name: string;
    subtitle: string;
    description: string;
    avatarUrl?: string;
    badgeIcon?: string;
    isRecommended?: boolean;
    order?: number;
    defaultDurationSec?: number;
    defaultLanguage?: "zh" | "en";
    scriptType: CreationAssistantScriptType;
    shootingStyle: CreationAssistantShootingStyle;
    primaryPlatform?: CreationAssistantPlatform;
    suggestedQuickPhrases?: string[];
    placeholder?: string;
};
