import { isPathEqualOrDescendant } from "@mdit/utils/path-utils"
import type { WorkspaceSlice } from "@/store"
import { type DndDragEndEvent, isFileEntryDragData } from "./dnd-types"

type HandleExplorerDropParams = {
	event: DndDragEndEvent
	moveEntry: WorkspaceSlice["moveEntry"]
	selectedEntryPaths: Set<string>
	resetSelection: () => void
	overrideTargetPath?: string | null
}

export async function handleExplorerDrop({
	event,
	moveEntry,
	selectedEntryPaths,
	resetSelection,
	overrideTargetPath,
}: HandleExplorerDropParams): Promise<boolean> {
	const sourceData = event.operation.source.data
	const sourcePath = isFileEntryDragData(sourceData)
		? sourceData.path
		: undefined
	const dropZoneId = event.operation.target?.id
	const destinationPath =
		overrideTargetPath ??
		(dropZoneId?.startsWith("droppable-")
			? dropZoneId.slice("droppable-".length)
			: dropZoneId)

	if (!sourcePath || !destinationPath) {
		return false
	}

	if (!destinationPath || sourcePath === destinationPath) {
		return true
	}

	const isSelected = selectedEntryPaths.has(sourcePath)
	const hasMultipleSelections = selectedEntryPaths.size > 1

	if (isSelected && hasMultipleSelections) {
		const selectedPaths = Array.from(selectedEntryPaths) as string[]
		const pathsToMove = selectedPaths.filter((path) => {
			return !selectedPaths.some(
				(otherPath) =>
					otherPath !== path && isPathEqualOrDescendant(path, otherPath),
			)
		})
		if (pathsToMove.length === 0) {
			return true
		}

		const results = await Promise.allSettled(
			pathsToMove.map((path) => moveEntry(path, destinationPath)),
		)

		results.forEach((result, index) => {
			if (result.status === "rejected") {
				console.error(
					`Failed to move entry: ${pathsToMove[index]}`,
					result.reason,
				)
			} else if (result.value === false) {
				console.error(`Failed to move entry: ${pathsToMove[index]}`)
			}
		})
	} else {
		const success = await moveEntry(sourcePath, destinationPath)
		if (!success) {
			console.error("Failed to move entry")
		}
	}

	resetSelection()
	return true
}
