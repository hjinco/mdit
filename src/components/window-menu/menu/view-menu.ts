import { MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu"

export async function createViewMenu({
	toggleFileExplorer,
	toggleCollectionView,
	zoomIn,
	zoomOut,
	resetZoom,
	openCommandMenu,
}: {
	toggleFileExplorer: () => void
	toggleCollectionView: () => void
	zoomIn: () => void
	zoomOut: () => void
	resetZoom: () => void
	openCommandMenu: () => void
}) {
	return await Submenu.new({
		text: "View",
		items: [
			await MenuItem.new({
				id: "command-menu",
				text: "Command Menu…",
				accelerator: "CmdOrCtrl+K",
				action: () => openCommandMenu(),
			}),
			await PredefinedMenuItem.new({
				text: "Separator",
				item: "Separator",
			}),
			await MenuItem.new({
				id: "toggle-explorer",
				text: "Toggle File Explorer",
				accelerator: "CmdOrCtrl+S",
				action: () => toggleFileExplorer(),
			}),
			await MenuItem.new({
				id: "toggle-collection-view",
				text: "Toggle Collection View",
				accelerator: "CmdOrCtrl+D",
				action: () => toggleCollectionView(),
			}),
			await PredefinedMenuItem.new({
				text: "Separator",
				item: "Separator",
			}),
			await MenuItem.new({
				id: "zoom-in",
				text: "Zoom In",
				accelerator: "CmdOrCtrl+=",
				action: () => zoomIn(),
			}),
			await MenuItem.new({
				id: "zoom-out",
				text: "Zoom Out",
				accelerator: "CmdOrCtrl+-",
				action: () => zoomOut(),
			}),
			await MenuItem.new({
				id: "reset-zoom",
				text: "Reset Zoom",
				accelerator: "CmdOrCtrl+0",
				action: () => resetZoom(),
			}),
		],
	})
}
