type FrontmatterBlockLike = {
	type?: string
} | null

export function getFrontmatterBlockIndex(
	children: ReadonlyArray<FrontmatterBlockLike>,
) {
	return children.findIndex((child) => child?.type === "frontmatter")
}

export function getPreviousBlockIndexBeforeFrontmatter(
	children: ReadonlyArray<FrontmatterBlockLike>,
) {
	const frontmatterIndex = getFrontmatterBlockIndex(children)
	return frontmatterIndex > 0 ? frontmatterIndex - 1 : null
}

export function getNextBlockIndexAfterFrontmatter(
	children: ReadonlyArray<FrontmatterBlockLike>,
) {
	const frontmatterIndex = getFrontmatterBlockIndex(children)
	if (frontmatterIndex === -1) {
		return null
	}

	const nextIndex = frontmatterIndex + 1
	return nextIndex < children.length ? nextIndex : null
}

export function getNextBlockInsertIndexAfterFrontmatter(
	children: ReadonlyArray<FrontmatterBlockLike>,
) {
	const frontmatterIndex = getFrontmatterBlockIndex(children)
	return frontmatterIndex === -1 ? null : frontmatterIndex + 1
}
