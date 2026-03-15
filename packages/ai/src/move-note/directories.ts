import { parse, relative } from "pathe"

export const ROOT_LABEL = "."
const BACKSLASH_REGEX = /\\/g
const MULTIPLE_SLASHES_REGEX = /\/{2,}/g
const CURRENT_DIRECTORY_PREFIX_REGEX = /^(?:\.\/)+/

export function normalizeMoveDirectoryPath(path: string) {
	const withForwardSlashes = path.replace(BACKSLASH_REGEX, "/")
	const collapsed = withForwardSlashes.replace(MULTIPLE_SLASHES_REGEX, "/")
	const withoutCurrentDirectoryPrefix =
		collapsed === ROOT_LABEL
			? ROOT_LABEL
			: collapsed.replace(CURRENT_DIRECTORY_PREFIX_REGEX, "")
	if (withoutCurrentDirectoryPrefix.length === 0) {
		return ROOT_LABEL
	}
	const root = parse(withoutCurrentDirectoryPrefix).root
	if (withoutCurrentDirectoryPrefix === root) {
		return withoutCurrentDirectoryPrefix
	}
	return withoutCurrentDirectoryPrefix.endsWith("/")
		? withoutCurrentDirectoryPrefix.slice(0, -1)
		: withoutCurrentDirectoryPrefix
}

export function formatMoveDirectoryPath(
	workspacePath: string,
	directoryPath: string,
) {
	const relativePath = relative(
		normalizeMoveDirectoryPath(workspacePath),
		normalizeMoveDirectoryPath(directoryPath),
	)
	return relativePath.length > 0 ? relativePath : ROOT_LABEL
}

export function collectMoveDirectoryCatalogEntries(params: {
	workspacePath: string
	candidateDirectories: string[]
}) {
	const absolutePathByDisplayPath = new Map<string, string>()

	for (const directoryPath of params.candidateDirectories) {
		const displayPath = formatMoveDirectoryPath(
			params.workspacePath,
			directoryPath,
		)
		if (!absolutePathByDisplayPath.has(displayPath)) {
			absolutePathByDisplayPath.set(displayPath, directoryPath)
		}
	}

	if (!absolutePathByDisplayPath.has(ROOT_LABEL)) {
		absolutePathByDisplayPath.set(ROOT_LABEL, params.workspacePath)
	}

	return Array.from(absolutePathByDisplayPath.entries())
		.map(([displayPath, absolutePath]) => ({
			displayPath,
			absolutePath,
		}))
		.sort((left, right) => {
			if (left.displayPath === ROOT_LABEL) {
				return -1
			}
			if (right.displayPath === ROOT_LABEL) {
				return 1
			}
			return left.displayPath.localeCompare(right.displayPath)
		})
}

export function resolveMoveDirectoryPath(params: {
	workspacePath: string
	candidateDirectories: string[]
	destinationDir: string
}) {
	const normalizedDestinationDir = normalizeMoveDirectoryPath(
		params.destinationDir,
	)

	return collectMoveDirectoryCatalogEntries({
		workspacePath: params.workspacePath,
		candidateDirectories: params.candidateDirectories,
	}).find((entry) => entry.displayPath === normalizedDestinationDir)
		?.absolutePath
}
