import { Button } from "@base-ui/react/button"
import { DialogTitle } from "@mdit/ui/components/dialog"
import { cn } from "@mdit/ui/lib/utils"
import {
	IconAdjustmentsHorizontal,
	IconBrain,
	IconCertificate,
	IconKeyboard,
	IconPlugConnected,
	IconRefresh,
	IconSearch,
} from "@tabler/icons-react"
import type { ComponentType } from "react"

export type SettingsTab =
	| "preferences"
	| "ai"
	| "api-mcp"
	| "sync"
	| "indexing"
	| "hotkeys"
	| "license"

interface SettingsNavigationProps {
	activeTab: SettingsTab
	onTabChange: (tab: SettingsTab) => void
	hasWorkspace: boolean
}

type TabIcon = ComponentType<{
	className?: string
	size?: number | string
	stroke?: number | string
}>

type SettingsSection = {
	id: string
	label: string
	tabs: SettingsTab[]
}

const tabMeta: Record<SettingsTab, { label: string; icon: TabIcon }> = {
	preferences: { label: "Preferences", icon: IconAdjustmentsHorizontal },
	ai: { label: "AI", icon: IconBrain },
	"api-mcp": { label: "MCP", icon: IconPlugConnected },
	sync: { label: "Sync", icon: IconRefresh },
	indexing: { label: "Indexing", icon: IconSearch },
	hotkeys: { label: "Hotkeys", icon: IconKeyboard },
	license: { label: "License", icon: IconCertificate },
}

export function SettingsNavigation({
	activeTab,
	onTabChange,
	hasWorkspace,
}: SettingsNavigationProps) {
	const accountSection: SettingsSection = {
		id: "account",
		label: "Account",
		tabs: ["preferences"],
	}
	const vaultSection: SettingsSection = {
		id: "vault",
		label: "Vault",
		tabs: ["sync", "indexing"],
	}
	const featuresSection: SettingsSection = {
		id: "features",
		label: "Features",
		tabs: ["ai", "api-mcp", "hotkeys", "license"],
	}

	const sections: SettingsSection[] = hasWorkspace
		? [accountSection, vaultSection, featuresSection]
		: [accountSection, featuresSection]

	return (
		<nav className="flex w-56 flex-col gap-4 bg-muted/50 px-2 py-3">
			<DialogTitle className="sr-only">Settings</DialogTitle>
			{sections.map((section) => (
				<div key={section.id} className="space-y-0.5">
					<p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
						{section.label}
					</p>
					{section.tabs.map((tabId) => {
						const tab = tabMeta[tabId]
						const Icon = tab.icon

						return (
							<Button
								key={tabId}
								type="button"
								onClick={() => onTabChange(tabId)}
								className={cn(
									"inline-flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-left text-sm font-medium text-foreground/80 outline-none transition-colors",
									"focus-visible:ring-2 focus-visible:ring-ring/50",
									activeTab === tabId
										? "bg-muted text-foreground hover:bg-muted"
										: "hover:bg-muted hover:text-foreground",
								)}
							>
								<Icon size={18} stroke={1.9} className="shrink-0" />
								<span className="truncate">{tab.label}</span>
							</Button>
						)
					})}
				</div>
			))}
		</nav>
	)
}
