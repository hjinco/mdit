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
	zoomIn,
	zoomOut,
	resetZoom,
	openCommandMenu,
	goBack,
	goForward,
	toggleSettings,
}: {
	createNote: () => void | Promise<void>
	openWorkspace: () => void | Promise<void>
	toggleFileExplorer: () => void
	toggleCollectionView: () => void
	zoomIn: () => void
	zoomOut: () => void
	resetZoom: () => void
	openCommandMenu: () => void
	goBack: () => Promise<boolean>
	goForward: () => Promise<boolean>
	toggleSettings: () => void
}) {
	const menu = await Menu.new({
		items: [
			await createMditMenu({ toggleSettings }),
			await createFileMenu({
				createNote,
				openWorkspace,
			}),
			await createEditMenu(),
			await createViewMenu({
				toggleFileExplorer,
				toggleCollectionView,
				zoomIn,
				zoomOut,
				resetZoom,
				openCommandMenu,
			}),
			await createHistoryMenu({
				goBack,
				goForward,
			}),
			await createWindowMenu(),
			await createHelpMenu(),
		],
	})
	menu.setAsAppMenu()
}
