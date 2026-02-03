const WORKSPACE_HISTORY_KEY = "workspace-history"

const readWorkspaceHistory = (): string[] => {
	try {
		const rawHistory = localStorage.getItem(WORKSPACE_HISTORY_KEY)
		if (!rawHistory) {
			return []
		}

		const parsed: unknown = JSON.parse(rawHistory)
		if (!Array.isArray(parsed)) {
			return []
		}

		return parsed.filter(
			(entry: unknown): entry is string =>
				typeof entry === "string" && entry.length > 0,
		)
	} catch (error) {
		console.debug("Failed to parse workspace history:", error)
		return []
	}
}

const writeWorkspaceHistory = (paths: string[]): void => {
	localStorage.setItem(WORKSPACE_HISTORY_KEY, JSON.stringify(paths))
}

const removeFromWorkspaceHistory = (path: string): string[] => {
	const nextHistory = readWorkspaceHistory().filter((entry) => entry !== path)
	writeWorkspaceHistory(nextHistory)
	return nextHistory
}

export class WorkspaceHistoryRepository {
	readWorkspaceHistory(): string[] {
		return readWorkspaceHistory()
	}

	writeWorkspaceHistory(paths: string[]): void {
		writeWorkspaceHistory(paths)
	}

	removeFromWorkspaceHistory(path: string): string[] {
		return removeFromWorkspaceHistory(path)
	}
}
