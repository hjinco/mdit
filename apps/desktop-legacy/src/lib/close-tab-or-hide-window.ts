import { getCurrentWindow } from "@tauri-apps/api/window"
import { isMac } from "@/utils/platform"

type CloseTabOrHideWindowParams = {
	isEditMode: boolean
	hasActiveTab: boolean
	closeActiveTab: () => void
	closeEditWindow?: () => void | Promise<void>
	hideWindow?: () => void | Promise<void>
	isMacPlatform?: () => boolean
}

export async function closeTabOrHideWindow({
	isEditMode,
	hasActiveTab,
	closeActiveTab,
	closeEditWindow = () => getCurrentWindow().close(),
	hideWindow = () => getCurrentWindow().hide(),
	isMacPlatform = isMac,
}: CloseTabOrHideWindowParams): Promise<void> {
	if (isEditMode) {
		await closeEditWindow()
		return
	}

	if (hasActiveTab) {
		closeActiveTab()
		return
	}

	if (!isMacPlatform()) {
		return
	}

	await hideWindow()
}
