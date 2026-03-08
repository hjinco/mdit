import type { FileTreeSelectionModifiers } from "@mdit/file-tree"
import { type MouseEvent, useCallback } from "react"
import { revealInFileManager } from "@/components/file-explorer/utils/file-manager"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"
import { isImageFile } from "@/utils/file-icon"

type UseEntryPrimaryActionParams = {
	handleItemPress: (id: string, modifiers?: FileTreeSelectionModifiers) => void
	openTab: (path: string) => void
	openImagePreview: (path: string) => void
	toggleExpanded: (path: string) => void
}

export const useEntryPrimaryAction = ({
	handleItemPress,
	openTab,
	openImagePreview,
	toggleExpanded,
}: UseEntryPrimaryActionParams) => {
	return useCallback(
		(entry: WorkspaceEntry, event: MouseEvent<HTMLButtonElement>) => {
			event.stopPropagation()
			const isMulti = event.metaKey || event.ctrlKey
			const isRange = event.shiftKey

			handleItemPress(entry.path, {
				shiftKey: event.shiftKey,
				metaKey: event.metaKey,
				ctrlKey: event.ctrlKey,
				altKey: event.altKey,
			})

			if (!isRange && !isMulti) {
				if (entry.isDirectory) {
					toggleExpanded(entry.path)
				} else if (entry.name.endsWith(".md")) {
					openTab(entry.path)
				} else if (isImageFile(entry.name)) {
					openImagePreview(entry.path)
				} else {
					revealInFileManager(entry.path, entry.isDirectory)
				}
			}
		},
		[handleItemPress, openTab, openImagePreview, toggleExpanded],
	)
}
