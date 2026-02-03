import { Command } from "@tauri-apps/plugin-shell"
import { normalizePathSeparators } from "@/utils/path-utils"
import { getPlatform } from "@/utils/platform"

const PLATFORM = getPlatform()

export function getRevealInFileManagerLabel(): string {
	if (PLATFORM === "windows") {
		return "Show in File Explorer"
	}

	if (PLATFORM === "linux") {
		return "Show in File Manager"
	}

	return "Reveal in Finder"
}

const toWindowsPath = (path: string) =>
	normalizePathSeparators(path).replace(/\//g, "\\")

const getDirectoryPath = (path: string) => {
	const normalized = normalizePathSeparators(path)
	const lastSlashIndex = normalized.lastIndexOf("/")
	if (lastSlashIndex <= 0) {
		return normalized
	}
	return normalized.slice(0, lastSlashIndex)
}

/**
 * Opens the given path in the native file manager and, when possible,
 * highlights the file entry. Platform-aware implementation for macOS, Windows, and Linux.
 */
export async function revealInFileManager(
	path: string,
	isDirectory: boolean,
): Promise<void> {
	try {
		if (PLATFORM === "windows") {
			const windowsPath = toWindowsPath(path)
			const args = isDirectory ? [windowsPath] : ["/select,", windowsPath]
			await Command.create("explorer.exe", args).execute()
			return
		}

		if (PLATFORM === "linux") {
			const directoryToOpen = isDirectory ? path : getDirectoryPath(path)
			await Command.create("xdg-open", [
				normalizePathSeparators(directoryToOpen),
			]).execute()
			return
		}

		// macOS
		const args = isDirectory
			? [normalizePathSeparators(path)]
			: ["-R", normalizePathSeparators(path)]
		await Command.create("open", args).execute()
	} catch (error) {
		console.error("Failed to reveal entry in file manager:", error)
	}
}
