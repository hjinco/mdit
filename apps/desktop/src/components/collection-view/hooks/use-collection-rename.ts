import { useCallback, useState } from "react"
import { toast } from "sonner"
import type { WorkspaceEntry } from "@/store"

type RenameEntry = (
	entry: WorkspaceEntry,
	newName: string,
) => Promise<string | null>

type UseCollectionRenameProps = {
	renameEntry: RenameEntry
	invalidatePreview: (path: string) => void
}

export function useCollectionRename({
	renameEntry,
	invalidatePreview,
}: UseCollectionRenameProps) {
	const [renamingEntryPath, setRenamingEntryPath] = useState<string | null>(
		null,
	)

	const beginRenaming = useCallback((entry: WorkspaceEntry) => {
		setRenamingEntryPath(entry.path)
	}, [])

	const cancelRenaming = useCallback(() => {
		setRenamingEntryPath(null)
	}, [])

	const handleRenameSubmit = useCallback(
		async (entry: WorkspaceEntry, newName: string) => {
			try {
				const newPath = await renameEntry(entry, newName)
				// Clear cache for old path if rename succeeded
				if (newPath !== null) {
					invalidatePreview(entry.path)
				}
			} catch (error) {
				console.error("Failed to rename entry:", error)
				toast.error(
					error instanceof Error ? error.message : "Failed to rename entry.",
				)
			} finally {
				setRenamingEntryPath(null)
			}
		},
		[invalidatePreview, renameEntry],
	)

	return {
		renamingEntryPath,
		beginRenaming,
		cancelRenaming,
		handleRenameSubmit,
	}
}
