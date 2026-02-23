import { Button } from "@mdit/ui/components/button"
import { DialogTitle } from "@mdit/ui/components/dialog"
import { cn } from "@mdit/ui/lib/utils"

export type SettingsTab =
	| "preferences"
	| "ai"
	| "api-mcp"
	| "sync"
	| "indexing"
	| "license"

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
	const tabs: Array<{ id: SettingsTab; label: string }> = [
		{ id: "preferences", label: "Preferences" },
		{ id: "ai", label: "AI" },
		{ id: "api-mcp", label: "MCP" },
		...(hasWorkspace
			? [
					{ id: "sync", label: "Sync" } as const,
					{ id: "indexing", label: "Indexing" } as const,
				]
			: []),
		{ id: "license", label: "License" },
	]

	return (
		<nav className="flex flex-col p-1 gap-0.5 border-r w-40 bg-muted">
			<DialogTitle className="text-xs text-muted-foreground p-3">
				Settings
			</DialogTitle>
			{tabs.map((tab) => (
				<Button
					key={tab.id}
					variant="ghost"
					size="sm"
					onClick={() => onTabChange(tab.id)}
					className={cn(
						"justify-start",
						activeTab === tab.id
							? "bg-stone-200 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-700"
							: "text-accent-foreground/80 hover:bg-stone-200 dark:hover:bg-stone-700 hover:text-accent-foreground",
					)}
				>
					{tab.label}
				</Button>
			))}
		</nav>
	)
}
