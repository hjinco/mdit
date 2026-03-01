export type FrontmatterComparableRow = {
	id: string
	key: string
	type: string
	value: unknown
}

const isObjectValue = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null

type SeenPairs = WeakMap<object, WeakSet<object>>

const isSeenPair = (
	seenPairs: SeenPairs,
	left: object,
	right: object,
): boolean => {
	const seenRightItems = seenPairs.get(left)
	if (seenRightItems?.has(right)) return true
	if (seenRightItems) {
		seenRightItems.add(right)
	} else {
		const nextSeenRightItems = new WeakSet<object>()
		nextSeenRightItems.add(right)
		seenPairs.set(left, nextSeenRightItems)
	}
	return false
}

const isSameValue = (left: unknown, right: unknown): boolean => {
	const seenPairs: SeenPairs = new WeakMap()

	const compare = (leftValue: unknown, rightValue: unknown): boolean => {
		if (Object.is(leftValue, rightValue)) return true

		if (leftValue instanceof Date && rightValue instanceof Date) {
			return leftValue.getTime() === rightValue.getTime()
		}

		if (Array.isArray(leftValue) && Array.isArray(rightValue)) {
			if (isSeenPair(seenPairs, leftValue, rightValue)) return true
			if (leftValue.length !== rightValue.length) return false
			for (let index = 0; index < leftValue.length; index += 1) {
				if (!compare(leftValue[index], rightValue[index])) return false
			}
			return true
		}

		if (isObjectValue(leftValue) && isObjectValue(rightValue)) {
			if (isSeenPair(seenPairs, leftValue, rightValue)) return true
			const leftKeys = Object.keys(leftValue)
			const rightKeys = Object.keys(rightValue)
			if (leftKeys.length !== rightKeys.length) return false
			for (const key of leftKeys) {
				if (!(key in rightValue)) return false
				if (!compare(leftValue[key], rightValue[key])) return false
			}
			return true
		}

		return false
	}

	return compare(left, right)
}

export const areFrontmatterRowsEqual = (
	leftRows: FrontmatterComparableRow[],
	rightRows: FrontmatterComparableRow[],
) => {
	if (leftRows === rightRows) return true
	if (leftRows.length !== rightRows.length) return false

	for (let index = 0; index < leftRows.length; index += 1) {
		const left = leftRows[index]
		const right = rightRows[index]

		if (
			left.id !== right.id ||
			left.key !== right.key ||
			left.type !== right.type ||
			!isSameValue(left.value, right.value)
		) {
			return false
		}
	}

	return true
}
