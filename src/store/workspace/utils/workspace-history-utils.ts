export const WORKSPACE_HISTORY_KEY = 'workspace-history'

export function readWorkspaceHistory(): string[] {
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
        typeof entry === 'string' && entry.length > 0
    )
  } catch (error) {
    console.debug('Failed to parse workspace history:', error)
    return []
  }
}

export function writeWorkspaceHistory(paths: string[]) {
  localStorage.setItem(WORKSPACE_HISTORY_KEY, JSON.stringify(paths))
}

export function removeFromWorkspaceHistory(path: string) {
  const nextHistory = readWorkspaceHistory().filter((entry) => entry !== path)
  writeWorkspaceHistory(nextHistory)
  return nextHistory
}
