import { MenuItem, Submenu } from "@tauri-apps/api/menu"

export async function createHistoryMenu({
	goBack,
	goForward,
}: {
	goBack: () => Promise<boolean>
	goForward: () => Promise<boolean>
}) {
	return await Submenu.new({
		text: "History",
		items: [
			await MenuItem.new({
				id: "go-back",
				text: "Back",
				accelerator: "CmdOrCtrl+[",
				action: () => goBack(),
			}),
			await MenuItem.new({
				id: "go-forward",
				text: "Forward",
				accelerator: "CmdOrCtrl+]",
				action: () => goForward(),
			}),
		],
	})
}
