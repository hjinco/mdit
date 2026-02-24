import { MenuItem, Submenu } from "@tauri-apps/api/menu"
import { type AppHotkeyMap, hotkeyToMenuAccelerator } from "@/lib/hotkeys"

export async function createHistoryMenu({
	goBack,
	goForward,
	hotkeys,
}: {
	goBack: () => Promise<boolean>
	goForward: () => Promise<boolean>
	hotkeys: AppHotkeyMap
}) {
	return await Submenu.new({
		text: "History",
		items: [
			await MenuItem.new({
				id: "go-back",
				text: "Back",
				accelerator: hotkeyToMenuAccelerator(hotkeys["go-back"]),
				action: () => goBack(),
			}),
			await MenuItem.new({
				id: "go-forward",
				text: "Forward",
				accelerator: hotkeyToMenuAccelerator(hotkeys["go-forward"]),
				action: () => goForward(),
			}),
		],
	})
}
