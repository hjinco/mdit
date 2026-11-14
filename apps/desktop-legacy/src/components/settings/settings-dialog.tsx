import { Dialog, DialogContent } from "@mdit/ui/components/dialog"
import { type ComponentType, useEffect, useState } from "react"
import { useShallow } from "zustand/shallow"
import { useDesktopRuntime, useWindowState, useWorkspaceState } from "@/state"
import type { SettingsTab } from "@/state/window"

import { AITab } from "./ai/ai-tab"
import { HotkeysTab } from "./hotkeys/hotkeys-tab"
import { IndexingTab } from "./indexing/indexing-tab"
import { PreferencesTab } from "./preferences/preferences-tab"
import { SettingsNavigation } from "./settings-navigation"
import { coerceSettingsTab } from "./settings-tabs"
import { SyncTab } from "./sync/sync-tab"

const SETTINGS_TAB_COMPONENTS: Record<SettingsTab, ComponentType> = {
	preferences: PreferencesTab,
	hotkeys: HotkeysTab,
	ai: AITab,
	sync: SyncTab,
	indexing: IndexingTab,
}

export function SettingsDialog() {
	const workspacePath = useWorkspaceState((s) => s.workspacePath)
	const { isSettingsDialogOpen, settingsInitialTab } = useWindowState(
		useShallow((s) => ({
			isSettingsDialogOpen: s.isSettingsDialogOpen,
			settingsInitialTab: s.settingsInitialTab,
		})),
	)
	const setSettingsDialogOpen =
		useDesktopRuntime().window.commands.setSettingsDialogOpen

	const hasWorkspace = Boolean(workspacePath)
	const [activeTab, setActiveTab] = useState<SettingsTab>("preferences")

	useEffect(() => {
		if (isSettingsDialogOpen && settingsInitialTab) {
			setActiveTab(coerceSettingsTab(settingsInitialTab, hasWorkspace))
		}
	}, [isSettingsDialogOpen, settingsInitialTab, hasWorkspace])

	useEffect(() => {
		setActiveTab((prev) => coerceSettingsTab(prev, hasWorkspace))
	}, [hasWorkspace])

	const ActiveTabComponent = SETTINGS_TAB_COMPONENTS[activeTab]

	return (
		<Dialog open={isSettingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
			<DialogContent className="md:max-w-5xl max-h-[min(800px,calc(100vh-6rem))] w-full h-full p-0 overflow-hidden flex">
				<SettingsNavigation
					activeTab={activeTab}
					onTabChange={(tab) =>
						setActiveTab(coerceSettingsTab(tab, hasWorkspace))
					}
					hasWorkspace={hasWorkspace}
				/>

				<div className="flex-1 flex flex-col">
					<ActiveTabComponent />
				</div>
			</DialogContent>
		</Dialog>
	)
}
