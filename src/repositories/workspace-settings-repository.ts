import type { WorkspaceSettings } from "@/lib/settings-utils"
import { loadSettings, saveSettings } from "@/lib/settings-utils"
import {
	isPathEqualOrDescendant,
	normalizePathSeparators,
} from "@/utils/path-utils"

const DRIVE_LETTER_REGEX = /^[a-zA-Z]:\//
const isAbsolutePath = (path: string) =>
	path.startsWith("/") || DRIVE_LETTER_REGEX.test(path)

const normalizeDirectoryList = (paths: unknown[]): string[] => {
	const normalizedSet = new Set<string>()

	for (const path of paths) {
		if (typeof path !== "string") continue
		const trimmed = path.trim()
		if (!trimmed) continue
		const normalized = normalizePathSeparators(trimmed)
		if (normalized) {
			normalizedSet.add(normalized)
		}
	}

	return Array.from(normalizedSet)
}

const toRelativePath = (workspacePath: string, path: string): string => {
	const normalizedWorkspace = normalizePathSeparators(workspacePath)
	const normalizedPath = normalizePathSeparators(path)

	if (!normalizedWorkspace || !normalizedPath) return normalizedPath
	if (normalizedPath === normalizedWorkspace) return "."

	const workspacePrefix = `${normalizedWorkspace}/`
	if (normalizedPath.startsWith(workspacePrefix)) {
		const relative = normalizedPath.slice(workspacePrefix.length)
		return relative.length > 0 ? relative : "."
	}

	return normalizedPath
}

const toAbsolutePath = (workspacePath: string, path: string): string | null => {
	const normalizedWorkspace = normalizePathSeparators(workspacePath)
	const normalizedPath = normalizePathSeparators(path)
	if (!normalizedPath) return null

	const withoutDotPrefix = normalizedPath.startsWith("./")
		? normalizedPath.slice(2)
		: normalizedPath

	if (withoutDotPrefix === "." || withoutDotPrefix === "") {
		return normalizedWorkspace
	}

	if (isAbsolutePath(withoutDotPrefix)) {
		return withoutDotPrefix
	}

	if (!normalizedWorkspace) return null

	return normalizePathSeparators(`${normalizedWorkspace}/${withoutDotPrefix}`)
}

const getPinnedDirectoriesFromSettings = (
	workspacePath: string | null,
	settings: WorkspaceSettings | null | undefined,
): string[] => {
	if (!workspacePath) {
		return []
	}

	const rawPins = settings?.pinnedDirectories ?? []
	const normalizedPins = normalizeDirectoryList(rawPins)
	const absolutePins: string[] = []

	for (const pin of normalizedPins) {
		const absolutePath = toAbsolutePath(workspacePath, pin)
		if (absolutePath) {
			absolutePins.push(absolutePath)
		}
	}

	return Array.from(new Set(absolutePins))
}

const getExpandedDirectoriesFromSettings = (
	workspacePath: string | null,
	settings: WorkspaceSettings | null | undefined,
): string[] => {
	if (!workspacePath) {
		return []
	}

	const normalizedWorkspace = normalizePathSeparators(workspacePath)
	const storedExpanded = normalizeDirectoryList(
		settings?.expandedDirectories ?? [],
	)

	const absoluteExpanded = storedExpanded
		.map((directory) => toAbsolutePath(normalizedWorkspace, directory))
		.filter(
			(absolutePath): absolutePath is string =>
				absolutePath !== null &&
				isPathEqualOrDescendant(absolutePath, normalizedWorkspace),
		)

	return Array.from(new Set(absoluteExpanded))
}

const persistPinnedDirectories = async (
	workspacePath: string | null,
	pinnedDirectories: string[],
): Promise<void> => {
	if (!workspacePath) {
		return
	}

	try {
		const normalizedPins = normalizeDirectoryList(pinnedDirectories)
		const relativePins = normalizeDirectoryList(
			normalizedPins.map((path) => toRelativePath(workspacePath, path)),
		)
		await saveSettings(workspacePath, { pinnedDirectories: relativePins })
	} catch (error) {
		console.error("Failed to save pinned directories:", error)
	}
}

const persistExpandedDirectories = async (
	workspacePath: string | null,
	expandedDirectories: string[],
): Promise<void> => {
	if (!workspacePath) {
		return
	}

	try {
		const normalizedWorkspace = normalizePathSeparators(workspacePath)
		const relativeExpanded = normalizeDirectoryList(
			expandedDirectories
				.filter((path) => isPathEqualOrDescendant(path, normalizedWorkspace))
				.map((path) => toRelativePath(normalizedWorkspace, path)),
		)

		await saveSettings(workspacePath, {
			expandedDirectories: relativeExpanded,
		})
	} catch (error) {
		console.error("Failed to save expanded directories:", error)
	}
}

export class WorkspaceSettingsRepository {
	loadSettings(workspacePath: string): Promise<WorkspaceSettings> {
		return loadSettings(workspacePath)
	}

	getPinnedDirectoriesFromSettings(
		workspacePath: string | null,
		settings: WorkspaceSettings | null | undefined,
	): string[] {
		return getPinnedDirectoriesFromSettings(workspacePath, settings)
	}

	getExpandedDirectoriesFromSettings(
		workspacePath: string | null,
		settings: WorkspaceSettings | null | undefined,
	): string[] {
		return getExpandedDirectoriesFromSettings(workspacePath, settings)
	}

	persistPinnedDirectories(
		workspacePath: string | null,
		pinnedDirectories: string[],
	): Promise<void> {
		return persistPinnedDirectories(workspacePath, pinnedDirectories)
	}

	persistExpandedDirectories(
		workspacePath: string | null,
		expandedDirectories: string[],
	): Promise<void> {
		return persistExpandedDirectories(workspacePath, expandedDirectories)
	}
}
