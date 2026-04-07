import { getFileNameWithoutExtension } from "@mdit/utils/path-utils"
import { useCallback } from "react"
import { useStore } from "@/store"

/**
 * Hook to handle auto-renaming files based on first heading after save
 */
export function useAutoRenameOnSave(path: string) {
	const handleRenameAfterSave = useCallback(async () => {
		// Check if we should rename based on tab.name (which may be from first heading)
		const store = useStore.getState()
		const tab = store.getActiveTab()
		const { renameEntry } = store

		if (tab && tab.path === path) {
			if (tab.syncedName == null) {
				return path
			}

			const currentFileName = getFileNameWithoutExtension(path)

			// Only rename if tab.name differs from current filename and is not empty
			if (tab.syncedName !== "" && tab.syncedName !== currentFileName) {
				return renameEntry(
					{ path, name: tab.syncedName, isDirectory: false },
					`${tab.syncedName}.md`,
					{ preserveActiveTabSyncedName: true },
				)
			}
		}

		return path
	}, [path])

	return { handleRenameAfterSave }
}
