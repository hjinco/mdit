type HistorySelectionPointLike = {
	path: number[]
	offset: number
}

type HistorySelectionLike = {
	anchor: HistorySelectionPointLike
	focus: HistorySelectionPointLike
} | null

function cloneSelectionPoint<T extends HistorySelectionPointLike>(point: T): T {
	return {
		...point,
		path: [...point.path],
	}
}

function areSelectionPointsEqual(
	a: HistorySelectionPointLike,
	b: HistorySelectionPointLike,
): boolean {
	if (a.offset !== b.offset || a.path.length !== b.path.length) {
		return false
	}

	for (let i = 0; i < a.path.length; i++) {
		if (a.path[i] !== b.path[i]) {
			return false
		}
	}

	return true
}

export function cloneHistorySelection<T extends HistorySelectionLike>(
	selection: T,
): T {
	if (!selection) {
		return selection
	}

	return {
		anchor: cloneSelectionPoint(selection.anchor),
		focus: cloneSelectionPoint(selection.focus),
	} as T
}

export function areHistorySelectionsEqual(
	a: HistorySelectionLike,
	b: HistorySelectionLike,
): boolean {
	if (!a && !b) {
		return true
	}

	if (!a || !b) {
		return false
	}

	return (
		areSelectionPointsEqual(a.anchor, b.anchor) &&
		areSelectionPointsEqual(a.focus, b.focus)
	)
}
