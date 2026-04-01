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
	openWorkspace,
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
	openWorkspace: () => void | Promise<void>
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
			await createWindowMenu(),
			await createHelpMenu(),
		],
	})
	menu.setAsAppMenu()
}
