import { getFileNameWithoutExtension } from "@mdit/utils/path-utils"
import { useCallback } from "react"
import { useStore } from "@/store"

/**
 * Hook to handle auto-renaming files based on first heading after save
 */
export function useAutoRenameOnSave(documentId: number, path: string) {
	const handleRenameAfterSave = useCallback(async () => {
		// Check if we should rename based on the shared document title state.
		const store = useStore.getState()
		const document = store.getDocumentById(documentId)
		const { renameEntry } = store

		if (document && document.path === path) {
			if (document.syncedName == null) {
				return path
			}

			const currentFileName = getFileNameWithoutExtension(path)

			// Only rename if the synced title differs from the current filename.
			if (
				document.syncedName !== "" &&
				document.syncedName !== currentFileName
			) {
				return renameEntry(
					{ path, name: document.syncedName, isDirectory: false },
					`${document.syncedName}.md`,
					{ preserveActiveTabSyncedName: true },
				)
			}
		}

		return path
	}, [documentId, path])

	return { handleRenameAfterSave }
}
