import { createContext, type ReactNode, useContext } from "react"
import { isFileEntryDragData } from "./dnd-types"

export const EMPTY_DRAGGED_EXPLORER_PATHS: ReadonlySet<string> = new Set()

const ExplorerDragPathsContext = createContext<ReadonlySet<string>>(
	EMPTY_DRAGGED_EXPLORER_PATHS,
)
const ExplorerDropPathContext = createContext<string | null>(null)

type ExplorerDragPathsProviderProps = {
	children: ReactNode
	draggedExplorerPaths: ReadonlySet<string>
	hoveredExplorerDropPath: string | null
}

export function ExplorerDragPathsProvider({
	children,
	draggedExplorerPaths,
	hoveredExplorerDropPath,
}: ExplorerDragPathsProviderProps) {
	return (
		<ExplorerDragPathsContext.Provider value={draggedExplorerPaths}>
			<ExplorerDropPathContext.Provider value={hoveredExplorerDropPath}>
				{children}
			</ExplorerDropPathContext.Provider>
		</ExplorerDragPathsContext.Provider>
	)
}

export function useDraggedExplorerPaths() {
	return useContext(ExplorerDragPathsContext)
}

export function useHoveredExplorerDropPath() {
	return useContext(ExplorerDropPathContext)
}

export function getDraggedExplorerPaths(
	sourceData: unknown,
	selectedEntryPaths: ReadonlySet<string>,
) {
	if (!isFileEntryDragData(sourceData) || !sourceData.path) {
		return EMPTY_DRAGGED_EXPLORER_PATHS
	}

	if (selectedEntryPaths.size > 1 && selectedEntryPaths.has(sourceData.path)) {
		return new Set(selectedEntryPaths)
	}

	return new Set([sourceData.path])
}
