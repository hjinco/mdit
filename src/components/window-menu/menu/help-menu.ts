import { Submenu } from "@tauri-apps/api/menu"

export async function createHelpMenu() {
	return await Submenu.new({
		text: "Help",
		items: [],
	})
}
