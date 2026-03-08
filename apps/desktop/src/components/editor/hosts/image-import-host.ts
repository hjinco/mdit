import { useStore } from "@/store"
import { isPathEqualOrDescendant } from "@/utils/path-utils"
import { buildImageLinkData, type ImageLinkData } from "../utils/image-link"

export type PreparedEditorImageLink = ImageLinkData & {
	absolutePath: string
}

export type PrepareImageForEditorInsertDeps = {
	getWorkspacePath: () => string | null
	copyEntry: (
		sourcePath: string,
		destinationPath: string,
	) => Promise<string | null>
	buildImageLink: (path: string) => ImageLinkData
}

export class EditorImageImportError extends Error {
	readonly path: string

	constructor(path: string) {
		super("Failed to import image into workspace.")
		this.name = "EditorImageImportError"
		this.path = path
	}
}

const defaultRuntimeDeps: PrepareImageForEditorInsertDeps = {
	getWorkspacePath: () => useStore.getState().workspacePath,
	copyEntry: (sourcePath, destinationPath) =>
		useStore.getState().copyEntry(sourcePath, destinationPath),
	buildImageLink: buildImageLinkData,
}

export async function prepareImageForEditorInsert(
	path: string,
	runtimeDeps: PrepareImageForEditorInsertDeps = defaultRuntimeDeps,
): Promise<PreparedEditorImageLink> {
	const trimmedPath = path.trim()
	const workspacePath = runtimeDeps.getWorkspacePath()

	if (
		!trimmedPath ||
		!workspacePath ||
		isPathEqualOrDescendant(trimmedPath, workspacePath)
	) {
		return {
			absolutePath: trimmedPath,
			...runtimeDeps.buildImageLink(trimmedPath),
		}
	}

	const copiedPath = await runtimeDeps.copyEntry(trimmedPath, workspacePath)
	if (!copiedPath) {
		throw new EditorImageImportError(trimmedPath)
	}

	return {
		absolutePath: copiedPath,
		...runtimeDeps.buildImageLink(copiedPath),
	}
}
