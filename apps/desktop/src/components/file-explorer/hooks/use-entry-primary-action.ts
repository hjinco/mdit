import type { FileTreeSelectionModifiers } from "@mdit/file-tree"
import { type MouseEvent, useCallback } from "react"
import { revealInFileManager } from "@/components/file-explorer/utils/file-manager"
import type { WorkspaceEntry } from "@/store"
import { isImageFile } from "@/utils/file-icon"

type UseEntryPrimaryActionParams = {
	handleItemPress: (id: string, modifiers?: FileTreeSelectionModifiers) => void
	openTab: (path: string) => void
	openTabInNewTab: (path: string) => void
	openImagePreview: (path: string) => void
	toggleExpanded: (path: string) => void
}

type EntryPrimaryActionDeps = UseEntryPrimaryActionParams

type EntryPrimaryActionEvent = Pick<
	MouseEvent<HTMLButtonElement>,
	"altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "stopPropagation"
>

function getSelectionModifiers(
	entry: WorkspaceEntry,
	event: EntryPrimaryActionEvent,
	isPrimaryModifier: boolean,
): FileTreeSelectionModifiers {
	const modifiers: FileTreeSelectionModifiers = {
		shiftKey: event.shiftKey,
		metaKey: event.metaKey,
		ctrlKey: event.ctrlKey,
		altKey: event.altKey,
	}

	if (
		entry.name.endsWith(".md") &&
		isPrimaryModifier &&
		!event.shiftKey &&
		!event.altKey
	) {
		modifiers.metaKey = false
		modifiers.ctrlKey = false
	}

	return modifiers
}

export function handleExplorerEntryPrimaryAction(
	entry: WorkspaceEntry,
	event: EntryPrimaryActionEvent,
	{
		handleItemPress,
		openTab,
		openTabInNewTab,
		openImagePreview,
		toggleExpanded,
	}: EntryPrimaryActionDeps,
) {
	event.stopPropagation()

	const isPrimaryModifier = event.metaKey || event.ctrlKey
	const isRange = event.shiftKey
	const isToggleModifier = event.altKey
	const isMarkdownNote = entry.name.endsWith(".md")
	handleItemPress(
		entry.path,
		getSelectionModifiers(entry, event, isPrimaryModifier),
	)

	if (isRange || isToggleModifier) {
		return
	}

	if (entry.isDirectory) {
		if (!isPrimaryModifier) {
			toggleExpanded(entry.path)
		}
		return
	}

	if (isMarkdownNote) {
		if (isPrimaryModifier) {
			openTabInNewTab(entry.path)
			return
		}

		openTab(entry.path)
		return
	}

	if (!isPrimaryModifier && isImageFile(entry.name)) {
		openImagePreview(entry.path)
		return
	}

	if (!isPrimaryModifier) {
		revealInFileManager(entry.path, entry.isDirectory)
	}
}

export const useEntryPrimaryAction = ({
	handleItemPress,
	openTab,
	openTabInNewTab,
	openImagePreview,
	toggleExpanded,
}: UseEntryPrimaryActionParams) => {
	return useCallback(
		(entry: WorkspaceEntry, event: MouseEvent<HTMLButtonElement>) => {
			handleExplorerEntryPrimaryAction(entry, event, {
				handleItemPress,
				openTab,
				openTabInNewTab,
				openImagePreview,
				toggleExpanded,
			})
		},
		[
			handleItemPress,
			openTab,
			openTabInNewTab,
			openImagePreview,
			toggleExpanded,
		],
	)
}
