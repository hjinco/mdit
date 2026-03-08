import type { FilePasteHostDeps } from "@mdit/editor/media"
import clipboard from "tauri-plugin-clipboard-api"
import { isImageFile } from "@/utils/file-icon"
import { prepareImageForEditorInsert } from "./image-import-host"

const defaultRuntimeDeps: FilePasteHostDeps = {
	readClipboardFiles: () => clipboard.readFiles(),
	isImageFile,
	resolveImageLink: prepareImageForEditorInsert,
}

export const createDesktopFilePasteHost = (
	runtimeDeps: FilePasteHostDeps = defaultRuntimeDeps,
): FilePasteHostDeps => ({
	readClipboardFiles: runtimeDeps.readClipboardFiles,
	isImageFile: runtimeDeps.isImageFile,
	resolveImageLink: runtimeDeps.resolveImageLink,
})

export const desktopFilePasteHost = createDesktopFilePasteHost()
