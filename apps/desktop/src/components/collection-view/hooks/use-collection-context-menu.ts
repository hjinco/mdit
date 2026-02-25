import { Menu, MenuItem } from "@tauri-apps/api/menu"
import { useCallback } from "react"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"

type UseCollectionContextMenuProps = {
	canRenameNoteWithAI: boolean
	renameNoteWithAI: (entry: WorkspaceEntry) => Promise<void>
	beginRenaming: (entry: WorkspaceEntry) => void
	handleDeleteEntries: (paths: string[]) => Promise<void>
	selectedEntryPaths: Set<string>
	setSelectedEntryPaths: (paths: Set<string>) => void
	setSelectionAnchorPath: (path: string | null) => void
	invalidatePreview: (path: string) => void
}

export function useCollectionContextMenu({
	canRenameNoteWithAI,
	renameNoteWithAI,
	beginRenaming,
	handleDeleteEntries,
	selectedEntryPaths,
	setSelectedEntryPaths,
	setSelectionAnchorPath,
	invalidatePreview,
}: UseCollectionContextMenuProps) {
	const showEntryMenu = useCallback(
		async (entry: WorkspaceEntry, selectionPaths: string[]) => {
			try {
				const itemPromises: Promise<MenuItem>[] = []

				if (entry.name.toLowerCase().endsWith(".md")) {
					itemPromises.push(
						MenuItem.new({
							id: `rename-ai-${entry.path}`,
							text: "Rename with AI",
							enabled: canRenameNoteWithAI,
							action: async () => {
								try {
									await renameNoteWithAI(entry)
									invalidatePreview(entry.path)
								} catch (error) {
									console.error("Failed to rename entry with AI:", error)
								}
							},
						}),
					)
				}

				itemPromises.push(
					MenuItem.new({
						id: `rename-${entry.path}`,
						text: "Rename",
						action: async () => {
							beginRenaming(entry)
						},
					}),
				)

				itemPromises.push(
					MenuItem.new({
						id: `delete-${entry.path}`,
						text: "Delete",
						action: async () => {
							const targets =
								selectionPaths.length > 0 ? selectionPaths : [entry.path]
							await handleDeleteEntries(targets)
						},
					}),
				)

				const items = await Promise.all(itemPromises)

				const menu = await Menu.new({
					items,
				})

				await menu.popup()
			} catch (error) {
				console.error("Failed to open context menu:", error)
			}
		},
		[
			beginRenaming,
			handleDeleteEntries,
			invalidatePreview,
			canRenameNoteWithAI,
			renameNoteWithAI,
		],
	)

	const handleEntryContextMenu = useCallback(
		async (entry: WorkspaceEntry) => {
			const isSelected = selectedEntryPaths.has(entry.path)
			let selectionTargets: string[]

			if (isSelected) {
				selectionTargets = Array.from(selectedEntryPaths)
			} else if (selectedEntryPaths.size === 1) {
				// Special case: if exactly one item is selected and user opens context menu
				// on a different entry, don't modify selection and only delete the context menu entry
				selectionTargets = [entry.path]
			} else {
				const nextSelection = new Set(selectedEntryPaths)
				const hadSelection = nextSelection.size > 0
				nextSelection.add(entry.path)
				selectionTargets = Array.from(nextSelection)
				setSelectedEntryPaths(nextSelection)
				if (!hadSelection) {
					setSelectionAnchorPath(entry.path)
				}
			}

			await showEntryMenu(entry, selectionTargets)
		},
		[
			selectedEntryPaths,
			setSelectedEntryPaths,
			setSelectionAnchorPath,
			showEntryMenu,
		],
	)

	return {
		handleEntryContextMenu,
	}
}
