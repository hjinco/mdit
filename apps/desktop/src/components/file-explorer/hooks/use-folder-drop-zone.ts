import { useCallback, useRef } from "react"
import { useShallow } from "zustand/shallow"
import { useDropZone } from "@/contexts/drop-context"
import { useStore } from "@/store"
import { isPathEqualOrDescendant } from "@/utils/path-utils"

export function useFolderDropZone({
	folderPath,
	depth,
}: {
	folderPath: string | null
	depth: number
}) {
	const ref = useRef<HTMLDivElement | null>(null)
	const { workspacePath, moveEntry, moveExternalEntry } = useStore(
		useShallow((state) => ({
			workspacePath: state.workspacePath,
			moveEntry: state.moveEntry,
			moveExternalEntry: state.moveExternalEntry,
		})),
	)

	const setRef = useCallback((node: HTMLDivElement | null) => {
		ref.current = node
	}, [])

	const handleDrop = useCallback(
		async (paths: string[]) => {
			if (!folderPath || paths.length === 0 || !workspacePath) {
				return
			}

			try {
				// Move each file to the destination folder
				const results = await Promise.allSettled(
					paths.map(async (sourcePath) => {
						// Check if sourcePath is within workspace
						const isInternal = isPathEqualOrDescendant(
							sourcePath,
							workspacePath,
						)

						if (isInternal) {
							// Use moveEntry for internal files
							return await moveEntry(sourcePath, folderPath)
						}
						// Use moveExternalEntry for external files
						return await moveExternalEntry(sourcePath, folderPath)
					}),
				)

				// Log any failures
				results.forEach((result, index) => {
					if (result.status === "rejected") {
						console.error(`Failed to move file: ${paths[index]}`, result.reason)
					} else if (result.value === false) {
						console.error(`Failed to move file: ${paths[index]}`)
					}
				})
			} catch (error) {
				console.error("Failed to move files:", error)
			}
		},
		[folderPath, workspacePath, moveEntry, moveExternalEntry],
	)

	const { isOver } = useDropZone({
		ref,
		path: folderPath,
		depth,
		onDrop: handleDrop,
	})

	return { isOver, ref: setRef }
}
