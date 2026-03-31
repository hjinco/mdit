export function renameExpandedDirectories(
	expanded: string[],
	oldPath: string,
	newPath: string,
): string[] {
	if (oldPath === newPath) {
		return expanded
	}

	const next: string[] = []
	const oldPrefix = `${oldPath}/`
	const newPrefix = `${newPath}/`

	for (const path of expanded) {
		if (path === oldPath) {
			next.push(newPath)
			continue
		}

		if (path.startsWith(oldPrefix)) {
			const suffix = path.slice(oldPrefix.length)
			next.push(`${newPrefix}${suffix}`)
			continue
		}

		next.push(path)
	}

	return next
}

export function removeExpandedDirectories(
	expanded: string[],
	pathsToRemove: string[],
): string[] {
	const next: string[] = []

	for (const path of expanded) {
		let shouldSkip = false
		for (const pathToRemove of pathsToRemove) {
			if (path === pathToRemove || path.startsWith(`${pathToRemove}/`)) {
				shouldSkip = true
				break
			}
		}

		if (!shouldSkip) {
			next.push(path)
		}
	}

	return next
}

export function addExpandedDirectories(
	expanded: string[],
	paths: string[],
): string[] {
	const next = [...expanded]

	for (const path of paths) {
		if (!next.includes(path)) {
			next.push(path)
		}
	}

	return next
}

export function toggleExpandedDirectory(
	expanded: string[],
	path: string,
): string[] {
	const isExpanded = expanded.includes(path)
	return isExpanded
		? expanded.filter((entry) => entry !== path)
		: [...expanded, path]
}
