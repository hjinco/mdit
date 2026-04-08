import type {
	BlockSelectionHostDeps,
	CreateLinkedNotesFromListItemsResult,
} from "@mdit/editor/selection"
import { stripMarkdownExtension } from "@mdit/utils/path-utils"
import { basename, dirname } from "pathe"
import { useStore } from "@/store"
import { toWikiTargetFromAbsolutePath } from "@/utils/wiki-link-utils"

type CreateNoteFn = (
	directoryPath: string,
	options?: {
		initialName?: string
		initialContent?: string
		openTab?: boolean
	},
) => Promise<string>

export type BlockSelectionHost = BlockSelectionHostDeps

type BlockSelectionHostRuntimeDeps = {
	getWorkspacePath: () => string | null
	getCurrentTabPath: () => string | null
	createNote: CreateNoteFn
	onCreateFailure?: (error: unknown) => void
}

const defaultRuntimeDeps: BlockSelectionHostRuntimeDeps = {
	getWorkspacePath: () => useStore.getState().workspacePath,
	getCurrentTabPath: () => useStore.getState().getActiveTabPath(),
	createNote: (directoryPath, options) =>
		useStore.getState().createNote(directoryPath, options),
	onCreateFailure: (error) =>
		console.error("Failed to create linked note from list item:", error),
}

export const createDesktopBlockSelectionHost = (
	tabId?: number,
	runtimeDeps?: Partial<BlockSelectionHostRuntimeDeps>,
): BlockSelectionHost => {
	const deps: BlockSelectionHostRuntimeDeps = {
		...defaultRuntimeDeps,
		...runtimeDeps,
		getCurrentTabPath:
			runtimeDeps?.getCurrentTabPath ??
			(() =>
				typeof tabId === "number"
					? useStore.getState().getTabPathById(tabId)
					: useStore.getState().getActiveTabPath()),
	}

	return {
		createLinkedNotesFromListItems: async (items) => {
			if (items.length === 0) {
				return []
			}

			const workspacePath = deps.getWorkspacePath()
			if (!workspacePath) {
				return items.map(() => null)
			}

			const currentTabPath = deps.getCurrentTabPath()
			const targetDirectory = currentTabPath
				? dirname(currentTabPath)
				: workspacePath

			const { createNote } = deps
			const results: CreateLinkedNotesFromListItemsResult[] = []

			for (const rawItemText of items) {
				const itemText = rawItemText.trim()
				const initialName = itemText || "Untitled"

				try {
					const newPath = await createNote(targetDirectory, {
						initialName,
						openTab: false,
					})
					const wikiTarget = toWikiTargetFromAbsolutePath(
						workspacePath,
						newPath,
					)
					const linkText = stripMarkdownExtension(basename(newPath))

					results.push({
						wikiTarget,
						linkText: linkText || initialName,
					})
				} catch (error) {
					results.push(null)
					deps.onCreateFailure?.(error)
				}
			}

			return results
		},
	}
}
