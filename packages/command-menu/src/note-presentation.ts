import { getParentPathLabel, stripMarkdownExtension } from "./path-utils"
import { toRelativePath } from "./use-note-name-search"

export type NotePresentation = {
	label: string
	relativePath: string
	parentPathLabel: string
}

export const resolveNotePresentation = ({
	note,
	path,
	workspacePath,
	fallbackName,
}: {
	note?: { label: string; relativePath: string }
	path: string
	workspacePath: string | null
	fallbackName: string
}): NotePresentation => {
	const label =
		note?.label || stripMarkdownExtension(fallbackName).trim() || fallbackName
	const relativePath = note?.relativePath ?? toRelativePath(path, workspacePath)

	return {
		label,
		relativePath,
		parentPathLabel: getParentPathLabel(relativePath),
	}
}
