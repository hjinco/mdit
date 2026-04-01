import { type AppHotkeyMap, hotkeyToMenuAccelerator } from "@mdit/store/hotkeys"
import { MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu"

export async function createViewMenu({
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
}: {
	toggleFileExplorer: () => void
	toggleCollectionView: () => void
	toggleChatPanel: () => void
	zoomIn: () => void
	zoomOut: () => void
	resetZoom: () => void
	openCommandMenu: () => void
	openGraphView: () => void
	chatPanelBetaEnabled: boolean
	hotkeys: AppHotkeyMap
}) {
	const items = [
		await MenuItem.new({
			id: "command-menu",
			text: "Command Menu…",
			accelerator: hotkeyToMenuAccelerator(hotkeys["open-command-menu"]),
			action: () => openCommandMenu(),
		}),
		await MenuItem.new({
			id: "graph-view",
			text: "Graph View…",
			accelerator: hotkeyToMenuAccelerator(hotkeys["toggle-graph-view"]),
			action: () => openGraphView(),
		}),
		await PredefinedMenuItem.new({
			text: "Separator",
			item: "Separator",
		}),
		await MenuItem.new({
			id: "toggle-explorer",
			text: "Toggle File Explorer",
			accelerator: hotkeyToMenuAccelerator(hotkeys["toggle-file-explorer"]),
			action: () => toggleFileExplorer(),
		}),
		await MenuItem.new({
			id: "toggle-collection-view",
			text: "Toggle Collection View",
			accelerator: hotkeyToMenuAccelerator(hotkeys["toggle-collection-view"]),
			action: () => toggleCollectionView(),
		}),
	]

	if (chatPanelBetaEnabled) {
		items.push(
			await MenuItem.new({
				id: "toggle-chat-panel",
				text: "Toggle Chat Panel",
				accelerator: hotkeyToMenuAccelerator(hotkeys["toggle-chat-panel"]),
				action: () => toggleChatPanel(),
			}),
		)
	}

	items.push(
		await PredefinedMenuItem.new({
			text: "Separator",
			item: "Separator",
		}),
		await MenuItem.new({
			id: "zoom-in",
			text: "Zoom In",
			accelerator: hotkeyToMenuAccelerator(hotkeys["zoom-in"]),
			action: () => zoomIn(),
		}),
		await MenuItem.new({
			id: "zoom-out",
			text: "Zoom Out",
			accelerator: hotkeyToMenuAccelerator(hotkeys["zoom-out"]),
			action: () => zoomOut(),
		}),
		await MenuItem.new({
			id: "reset-zoom",
			text: "Reset Zoom",
			accelerator: hotkeyToMenuAccelerator(hotkeys["reset-zoom"]),
			action: () => resetZoom(),
		}),
	)

	return await Submenu.new({
		text: "View",
		items,
	})
}
