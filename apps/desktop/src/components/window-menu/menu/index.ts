import type { AppHotkeyMap } from "@mdit/store/hotkeys"
import { Menu } from "@tauri-apps/api/menu"
import { createEditMenu } from "./edit-menu"
import { createFileMenu } from "./file-menu"
import { createHelpMenu } from "./help-menu"
import { createHistoryMenu } from "./history-menu"
import { createMditMenu } from "./mdit-menu"
import { createViewMenu } from "./view-menu"
import { createWindowMenu } from "./window-menu"

export async function installWindowMenu({
	createNote,
	closeTabOrHideWindow,
	openWorkspace,
	activatePreviousTab,
	activateNextTab,
	toggleFileExplorer,
	toggleCollectionView,
	toggleChatPanel,
	zoomIn,
	zoomOut,
	resetZoom,
	openCommandMenu,
	openGraphView,
	chatPanelBetaEnabled,
	goBack,
	goForward,
	toggleSettings,
	hotkeys,
}: {
	createNote: () => void | Promise<void>
	closeTabOrHideWindow: () => void
	openWorkspace: () => void | Promise<void>
	activatePreviousTab: () => void
	activateNextTab: () => void
	toggleFileExplorer: () => void
	toggleCollectionView: () => void
	toggleChatPanel: () => void
	zoomIn: () => void
	zoomOut: () => void
	resetZoom: () => void
	openCommandMenu: () => void
	openGraphView: () => void
	chatPanelBetaEnabled: boolean
	goBack: () => Promise<boolean>
	goForward: () => Promise<boolean>
	toggleSettings: () => void
	hotkeys: AppHotkeyMap
}) {
	const menu = await Menu.new({
		items: [
			await createMditMenu({ toggleSettings, hotkeys }),
			await createFileMenu({
				createNote,
				closeTabOrHideWindow,
				openWorkspace,
				hotkeys,
			}),
			await createEditMenu(),
			await createViewMenu({
				toggleFileExplorer,
				toggleCollectionView,
				toggleChatPanel,
				zoomIn,
				zoomOut,
				resetZoom,
				openCommandMenu,
				openGraphView,
				chatPanelBetaEnabled,
				hotkeys,
			}),
			await createHistoryMenu({
				goBack,
				goForward,
				hotkeys,
			}),
			await createWindowMenu({
				activatePreviousTab,
				activateNextTab,
				hotkeys,
			}),
			await createHelpMenu(),
		],
	})
	menu.setAsAppMenu()
}
