import {
	IconAdjustmentsHorizontal,
	IconBrain,
	IconKeyboard,
	IconPlugConnected,
	IconRefresh,
	IconSearch,
} from "@tabler/icons-react"
import type { ComponentType } from "react"
import type { SettingsTab } from "@/store"

type TabIcon = ComponentType<{
	className?: string
	size?: number | string
	stroke?: number | string
}>

export type SettingsSection = {
	id: string
	label: string
	tabs: SettingsTab[]
}

export const SETTINGS_TAB_META: Record<
	SettingsTab,
	{ label: string; icon: TabIcon }
> = {
	preferences: { label: "Preferences", icon: IconAdjustmentsHorizontal },
	ai: { label: "AI", icon: IconBrain },
	"api-mcp": { label: "MCP", icon: IconPlugConnected },
	sync: { label: "Sync", icon: IconRefresh },
	indexing: { label: "Indexing", icon: IconSearch },
	hotkeys: { label: "Hotkeys", icon: IconKeyboard },
}

const SETTINGS_SECTIONS: SettingsSection[] = [
	{
		id: "account",
		label: "Account",
		tabs: ["preferences"],
	},
	{
		id: "vault",
		label: "Vault",
		tabs: ["sync", "indexing"],
	},
	{
		id: "features",
		label: "Features",
		tabs: ["ai", "api-mcp", "hotkeys"],
	},
]

const WORKSPACE_ONLY_TABS = new Set<SettingsTab>(["sync", "indexing"])

export function isSettingsTabAvailable(
	tab: SettingsTab,
	hasWorkspace: boolean,
): boolean {
	if (hasWorkspace) {
		return true
	}
	return !WORKSPACE_ONLY_TABS.has(tab)
}

export function coerceSettingsTab(
	tab: SettingsTab,
	hasWorkspace: boolean,
): SettingsTab {
	return isSettingsTabAvailable(tab, hasWorkspace) ? tab : "preferences"
}

export function getSettingsSections(hasWorkspace: boolean): SettingsSection[] {
	return SETTINGS_SECTIONS.map((section) => ({
		...section,
		tabs: section.tabs.filter((tab) =>
			isSettingsTabAvailable(tab, hasWorkspace),
		),
	})).filter((section) => section.tabs.length > 0)
}

export function getSettingsTabs(hasWorkspace: boolean): SettingsTab[] {
	return getSettingsSections(hasWorkspace).flatMap((section) => section.tabs)
}
