import { Menu } from "@tauri-apps/api/menu"
import type { AppHotkeyMap } from "@/lib/hotkeys"
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
	zoomIn,
	zoomOut,
	resetZoom,
	openCommandMenu,
	openGraphView,
	goBack,
	goForward,
	toggleSettings,
	hotkeys,
}: {
	createNote: () => void | Promise<void>
	openWorkspace: () => void | Promise<void>
	toggleFileExplorer: () => void
	toggleCollectionView: () => void
	zoomIn: () => void
	zoomOut: () => void
	resetZoom: () => void
	openCommandMenu: () => void
	openGraphView: () => void
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
				zoomIn,
				zoomOut,
				resetZoom,
				openCommandMenu,
				openGraphView,
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
