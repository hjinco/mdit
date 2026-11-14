import type { EditorImageLinkResolverHost } from "@mdit/editor/media"
import { reportImageImportFailure } from "./image-import-feedback"
import { prepareImageForEditorInsert } from "./image-import-host"

export type DesktopImageImportHostDeps = Partial<EditorImageLinkResolverHost>

export const desktopImageImportHost: Required<EditorImageLinkResolverHost> = {
	resolveImageLink: prepareImageForEditorInsert,
	onResolveImageLinkError: reportImageImportFailure,
}
