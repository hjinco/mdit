import type { CreateLinkedNotesFromListItemsResult } from "@mdit/editor/plugins/block-selection-linked-notes"
import { basename, dirname } from "pathe"
import {
	stripMarkdownExtension,
	toWikiTargetFromAbsolutePath,
} from "@/store/workspace/helpers/fs-structure-helpers"

type CreateNoteFn = (
	directoryPath: string,
	options?: {
		initialName?: string
		initialContent?: string
		openTab?: boolean
	},
) => Promise<string>

export async function createLinkedNotesFromListItems({
	items,
	workspacePath,
	currentTabPath,
	createNote,
}: {
	items: string[]
	workspacePath: string
	currentTabPath: string | null
	createNote: CreateNoteFn
}): Promise<CreateLinkedNotesFromListItemsResult[]> {
	if (items.length === 0) {
		return []
	}

	const targetDirectory = currentTabPath
		? dirname(currentTabPath)
		: workspacePath
	const results: CreateLinkedNotesFromListItemsResult[] = []

	for (const rawItemText of items) {
		const itemText = rawItemText.trim()
		const initialName = itemText || "Untitled"

		try {
			const newPath = await createNote(targetDirectory, {
				initialName,
				openTab: false,
			})
			const wikiTarget = toWikiTargetFromAbsolutePath(workspacePath, newPath)
			const linkText = stripMarkdownExtension(basename(newPath))

			results.push({
				wikiTarget,
				linkText: linkText || initialName,
			})
		} catch (error) {
			results.push(null)
			console.error("Failed to create linked note from list item:", error)
		}
	}

	return results
}
