import type { CreateLinkedNotesFromListItemsResult } from "@mdit/editor/selection"
import { basename, dirname } from "pathe"
import { useStore } from "@/store"
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

export type BlockSelectionHost = {
	createLinkedNotesFromListItems: (
		items: string[],
	) => Promise<(CreateLinkedNotesFromListItemsResult | null)[]>
}

type BlockSelectionHostRuntimeDeps = {
	getWorkspacePath: () => string | null
	getCurrentTabPath: () => string | null
	createNote: CreateNoteFn
	onCreateFailure?: (error: unknown) => void
}

const defaultRuntimeDeps: BlockSelectionHostRuntimeDeps = {
	getWorkspacePath: () => useStore.getState().workspacePath,
	getCurrentTabPath: () => useStore.getState().tab?.path ?? null,
	createNote: (directoryPath, options) =>
		useStore.getState().createNote(directoryPath, options),
	onCreateFailure: (error) =>
		console.error("Failed to create linked note from list item:", error),
}

export const createDesktopBlockSelectionHost = (
	runtimeDeps: BlockSelectionHostRuntimeDeps = defaultRuntimeDeps,
): BlockSelectionHost => ({
	createLinkedNotesFromListItems: async (items) => {
		if (items.length === 0) {
			return []
		}

		const workspacePath = runtimeDeps.getWorkspacePath()
		if (!workspacePath) {
			return items.map(() => null)
		}

		const currentTabPath = runtimeDeps.getCurrentTabPath()
		const targetDirectory = currentTabPath
			? dirname(currentTabPath)
			: workspacePath

		const { createNote } = runtimeDeps
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
				runtimeDeps.onCreateFailure?.(error)
			}
		}

		return results
	},
})
