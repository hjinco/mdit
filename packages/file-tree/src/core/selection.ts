import type {
	FileTreeSelectionChangeMeta,
	FileTreeSelectionMode,
	FileTreeSelectionModifiers,
} from "./types"

type SelectFileTreeItemsParams = {
	targetId: string
	visibleIds: readonly string[]
	selectedIds: ReadonlySet<string>
	anchorId: string | null
	modifiers?: FileTreeSelectionModifiers
}

type SelectFileTreeItemsResult = {
	selectedIds: Set<string>
	anchorId: string | null
	meta: FileTreeSelectionChangeMeta
}

export function getSelectionMode(
	modifiers?: FileTreeSelectionModifiers,
): FileTreeSelectionMode {
	if (modifiers?.shiftKey) {
		return "range"
	}

	if (modifiers?.metaKey || modifiers?.ctrlKey) {
		return "toggle"
	}

	return "single"
}

export function selectFileTreeItems({
	targetId,
	visibleIds,
	selectedIds,
	anchorId,
	modifiers,
}: SelectFileTreeItemsParams): SelectFileTreeItemsResult {
	const mode = getSelectionMode(modifiers)
	let nextSelectedIds = new Set(selectedIds)
	let nextAnchorId = anchorId

	if (mode === "range") {
		const anchorIndex = anchorId ? visibleIds.indexOf(anchorId) : -1
		const targetIndex = visibleIds.indexOf(targetId)
		if (anchorIndex !== -1 && targetIndex !== -1) {
			nextSelectedIds = new Set(
				visibleIds.slice(
					Math.min(anchorIndex, targetIndex),
					Math.max(anchorIndex, targetIndex) + 1,
				),
			)
		} else {
			nextSelectedIds = new Set([targetId])
		}

		if (!anchorId || anchorIndex === -1 || !nextSelectedIds.has(anchorId)) {
			nextAnchorId = targetId
		}
	} else if (mode === "toggle") {
		if (nextSelectedIds.has(targetId)) {
			nextSelectedIds.delete(targetId)
		} else {
			nextSelectedIds.add(targetId)
		}

		if (nextSelectedIds.has(targetId)) {
			nextAnchorId = targetId
		} else if (!anchorId || !nextSelectedIds.has(anchorId)) {
			nextAnchorId = nextSelectedIds.values().next().value ?? null
		}
	} else {
		nextSelectedIds = new Set([targetId])
		nextAnchorId = targetId
	}

	if (nextSelectedIds.size === 0) {
		nextAnchorId = null
	}

	return {
		selectedIds: nextSelectedIds,
		anchorId: nextAnchorId,
		meta: {
			targetId,
			mode,
		},
	}
}
