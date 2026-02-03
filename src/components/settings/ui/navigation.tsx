import { cn } from "@/lib/utils"
import { Button } from "@/ui/button"
import { DialogTitle } from "@/ui/dialog"

export type SettingsTab = "preferences" | "ai" | "sync" | "indexing" | "license"

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
			<DialogTitle className="text-sm p-3 font-medium">Settings</DialogTitle>
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
