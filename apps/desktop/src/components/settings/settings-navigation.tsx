import { Button } from "@base-ui/react/button"
import { DialogTitle } from "@mdit/ui/components/dialog"
import { cn } from "@mdit/ui/lib/utils"
import type { SettingsTab } from "@/store"
import { getSettingsSections, SETTINGS_TAB_META } from "./settings-tabs"

interface SettingsNavigationProps {
	activeTab: SettingsTab
	onTabChange: (tab: SettingsTab) => void
	hasWorkspace: boolean
}

export function SettingsNavigation({
	activeTab,
	onTabChange,
	hasWorkspace,
}: SettingsNavigationProps) {
	const sections = getSettingsSections(hasWorkspace)

	return (
		<nav className="flex w-56 flex-col gap-4 bg-muted/50 px-2 py-3">
			<DialogTitle className="sr-only">Settings</DialogTitle>
			{sections.map((section) => (
				<div key={section.id} className="space-y-0.5">
					<p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
						{section.label}
					</p>
					{section.tabs.map((tabId) => {
						const tab = SETTINGS_TAB_META[tabId]
						const Icon = tab.icon

						return (
							<Button
								key={tabId}
								type="button"
								onClick={() => onTabChange(tabId)}
								className={cn(
									"inline-flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm font-medium text-foreground/80 outline-none transition-colors",
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
