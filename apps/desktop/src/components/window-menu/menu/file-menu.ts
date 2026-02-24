import { MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu"
import { type AppHotkeyMap, hotkeyToMenuAccelerator } from "@/lib/hotkeys"

export async function createFileMenu({
	createNote,
	openWorkspace,
	hotkeys,
}: {
	createNote: () => void | Promise<void>
	openWorkspace: () => void | Promise<void>
	hotkeys: AppHotkeyMap
}) {
	return await Submenu.new({
		text: "File",
		items: [
			await MenuItem.new({
				id: "new-note",
				text: "New Note",
				accelerator: hotkeyToMenuAccelerator(hotkeys["create-note"]),
				action: () => createNote(),
			}),
			await MenuItem.new({
				id: "open-folder",
				text: "Open Folder...",
				accelerator: hotkeyToMenuAccelerator(hotkeys["open-folder"]),
				action: () => openWorkspace(),
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
