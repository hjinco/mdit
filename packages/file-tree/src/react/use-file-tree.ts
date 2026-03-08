import { useCallback, useMemo } from "react"
import { createFileTreeIndex } from "../core/index-builder"
import { selectFileTreeItems } from "../core/selection"
import {
	buildRenderTree,
	getRangeIds as getCurrentRangeIds,
	getVisibleIds,
} from "../core/selectors"
import type { UseFileTreeOptions, UseFileTreeResult } from "../core/types"

function areSetsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>) {
	if (a.size !== b.size) {
		return false
	}

	for (const value of a) {
		if (!b.has(value)) {
			return false
		}
	}

	return true
}

export function useFileTree<T>({
	entries,
	adapter,
	state,
	onExpandedIdsChange,
	onSelectionChange,
}: UseFileTreeOptions<T>): UseFileTreeResult<T> {
	const index = useMemo(
		() => createFileTreeIndex(entries, adapter),
		[adapter, entries],
	)

	const tree = useMemo(() => buildRenderTree(index, state), [index, state])
	const visibleIds = useMemo(() => getVisibleIds(index, state), [index, state])
	const visibleIndexById = useMemo(() => {
		const map = new Map<string, number>()
		visibleIds.forEach((id, index) => {
			map.set(id, index)
		})
		return map
	}, [visibleIds])

	const updateExpandedIds = useCallback(
		(id: string, action: "expand" | "collapse" | "toggle") => {
			const node = index.nodesById.get(id)
			if (!node || node.kind !== "directory") {
				return
			}

			const nextExpandedIds = new Set(state.expandedIds)
			const hasId = nextExpandedIds.has(id)

			if (action === "expand") {
				if (hasId) {
					return
				}
				nextExpandedIds.add(id)
			} else if (action === "collapse") {
				if (!hasId) {
					return
				}
				nextExpandedIds.delete(id)
			} else if (hasId) {
				nextExpandedIds.delete(id)
			} else {
				nextExpandedIds.add(id)
			}

			void onExpandedIdsChange?.(nextExpandedIds, {
				targetId: id,
				action,
			})
		},
		[index.nodesById, onExpandedIdsChange, state.expandedIds],
	)

	const handleItemPress = useCallback(
		(id: string, modifiers = {}) => {
			if (!index.nodesById.has(id)) {
				return
			}

			const result = selectFileTreeItems({
				targetId: id,
				visibleIds,
				selectedIds: state.selectedIds,
				anchorId: state.anchorId,
				modifiers,
			})

			if (
				areSetsEqual(result.selectedIds, state.selectedIds) &&
				result.anchorId === state.anchorId
			) {
				return
			}

			void onSelectionChange?.(result.selectedIds, result.anchorId, result.meta)
		},
		[
			index.nodesById,
			onSelectionChange,
			state.anchorId,
			state.selectedIds,
			visibleIds,
		],
	)

	const getVisibleIndex = useCallback(
		(id: string) => visibleIndexById.get(id) ?? -1,
		[visibleIndexById],
	)
	const getNextVisibleId = useCallback(
		(id: string, direction: "prev" | "next") => {
			const currentIndex = visibleIndexById.get(id)
			if (currentIndex === undefined) {
				return null
			}

			const nextIndex =
				direction === "next" ? currentIndex + 1 : currentIndex - 1
			return visibleIds[nextIndex] ?? null
		},
		[visibleIds, visibleIndexById],
	)
	const getRangeIds = useCallback(
		(fromId: string, toId: string) =>
			getCurrentRangeIds(index, state, fromId, toId),
		[index, state],
	)
	const toggleExpanded = useCallback(
		(id: string) => updateExpandedIds(id, "toggle"),
		[updateExpandedIds],
	)
	const expand = useCallback(
		(id: string) => updateExpandedIds(id, "expand"),
		[updateExpandedIds],
	)
	const collapse = useCallback(
		(id: string) => updateExpandedIds(id, "collapse"),
		[updateExpandedIds],
	)

	return {
		tree,
		visibleIds,
		nodeById: index.entryById,
		handleItemPress,
		toggleExpanded,
		expand,
		collapse,
		getVisibleIndex,
		getNextVisibleId,
		getRangeIds,
	}
}
