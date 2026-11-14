export const getContextMenuSelection = ({
	entryPath,
	selectedEntryPaths,
	selectionAnchorPath,
	setEntrySelection,
}: {
	entryPath: string
	selectedEntryPaths: Set<string>
	selectionAnchorPath: string | null
	setEntrySelection: (selection: {
		selectedIds: Set<string>
		anchorId: string | null
	}) => void
}): string[] => {
	if (selectedEntryPaths.has(entryPath)) {
		return Array.from(selectedEntryPaths)
	}

	if (selectedEntryPaths.size === 1) {
		// Preserve the existing single-item selection when opening a different entry menu.
		return [entryPath]
	}

	const nextSelection = new Set(selectedEntryPaths)
	const hadSelection = nextSelection.size > 0
	nextSelection.add(entryPath)
	setEntrySelection({
		selectedIds: nextSelection,
		anchorId: hadSelection ? selectionAnchorPath : entryPath,
	})
	return Array.from(nextSelection)
}
