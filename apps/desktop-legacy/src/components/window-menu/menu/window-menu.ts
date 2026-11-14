import { MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu"
import {
	type AppHotkeyMap,
	hotkeyToMenuAccelerator,
} from "@/state/services/hotkeys"

export async function createWindowMenu({
	activatePreviousTab,
	activateNextTab,
	hotkeys,
}: {
	activatePreviousTab: () => void
	activateNextTab: () => void
	hotkeys: AppHotkeyMap
}) {
	return await Submenu.new({
		text: "Window",
		items: [
			await MenuItem.new({
				id: "previous-tab",
				text: "Previous Tab",
				accelerator: hotkeyToMenuAccelerator(hotkeys["previous-tab"]),
				action: () => activatePreviousTab(),
			}),
			await MenuItem.new({
				id: "next-tab",
				text: "Next Tab",
				accelerator: hotkeyToMenuAccelerator(hotkeys["next-tab"]),
				action: () => activateNextTab(),
			}),
			await PredefinedMenuItem.new({
				text: "Separator",
				item: "Separator",
			}),
			await PredefinedMenuItem.new({
				text: "Minimize",
				item: "Minimize",
			}),
			await PredefinedMenuItem.new({
				text: "Maximize",
				item: "Maximize",
			}),
			await PredefinedMenuItem.new({
				text: "Fullscreen",
				item: "Fullscreen",
			}),
			await PredefinedMenuItem.new({
				text: "Separator",
				item: "Separator",
			}),
			await PredefinedMenuItem.new({
				text: "Close Window",
				item: "CloseWindow",
			}),
		],
	})
}
