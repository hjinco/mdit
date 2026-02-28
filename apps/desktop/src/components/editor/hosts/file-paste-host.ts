import type { FilePasteHostDeps } from "@mdit/editor/media"
import clipboard from "tauri-plugin-clipboard-api"
import { isImageFile } from "@/utils/file-icon"

const defaultRuntimeDeps: FilePasteHostDeps = {
	readClipboardFiles: () => clipboard.readFiles(),
	isImageFile,
}

export const createDesktopFilePasteHost = (
	runtimeDeps: FilePasteHostDeps = defaultRuntimeDeps,
): FilePasteHostDeps => ({
	readClipboardFiles: runtimeDeps.readClipboardFiles,
	isImageFile: runtimeDeps.isImageFile,
})

export const desktopFilePasteHost = createDesktopFilePasteHost()
