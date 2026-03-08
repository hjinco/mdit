import type { FilePasteHostDeps } from "@mdit/editor/media"
import clipboard from "tauri-plugin-clipboard-api"
import { isImageFile } from "@/utils/file-icon"
import {
	type DesktopImageImportHostDeps,
	desktopImageImportHost,
} from "./image-import-runtime"

type DesktopFilePasteHostRuntimeDeps = Pick<
	FilePasteHostDeps,
	"readClipboardFiles" | "isImageFile"
> &
	DesktopImageImportHostDeps

const defaultRuntimeDeps: DesktopFilePasteHostRuntimeDeps = {
	readClipboardFiles: () => clipboard.readFiles(),
	isImageFile,
	...desktopImageImportHost,
}

export const createDesktopFilePasteHost = (
	runtimeDeps: DesktopFilePasteHostRuntimeDeps = defaultRuntimeDeps,
): FilePasteHostDeps => ({
	readClipboardFiles: runtimeDeps.readClipboardFiles,
	isImageFile: runtimeDeps.isImageFile,
	resolveImageLink:
		runtimeDeps.resolveImageLink ?? desktopImageImportHost.resolveImageLink,
	onResolveImageLinkError:
		runtimeDeps.onResolveImageLinkError ??
		desktopImageImportHost.onResolveImageLinkError,
})

export const desktopFilePasteHost = createDesktopFilePasteHost()
