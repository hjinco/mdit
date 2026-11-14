import {
	createContext,
	type ReactNode,
	useContext,
	useSyncExternalStore,
} from "react"
import { isFileEntryDragData } from "./dnd-types"

export const EMPTY_DRAGGED_EXPLORER_PATHS: ReadonlySet<string> = new Set()

const ExplorerDragPathsContext = createContext<ReadonlySet<string>>(
	EMPTY_DRAGGED_EXPLORER_PATHS,
)

type HoveredExplorerDropPathStore = {
	getSnapshot: () => string | null
	setSnapshot: (path: string | null) => void
	subscribe: (listener: () => void) => () => void
}

function createHoveredExplorerDropPathStore(
	initialPath: string | null,
): HoveredExplorerDropPathStore {
	let snapshot = initialPath
	const listeners = new Set<() => void>()

	return {
		getSnapshot: () => snapshot,
		setSnapshot: (path) => {
			if (snapshot === path) {
				return
			}

			snapshot = path
			for (const listener of listeners) {
				listener()
			}
		},
		subscribe: (listener) => {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
	}
}

const hoveredExplorerDropPathStore = createHoveredExplorerDropPathStore(null)

type ExplorerDragPathsProviderProps = {
	children: ReactNode
	draggedExplorerPaths: ReadonlySet<string>
}

export function ExplorerDragPathsProvider({
	children,
	draggedExplorerPaths,
}: ExplorerDragPathsProviderProps) {
	return (
		<ExplorerDragPathsContext.Provider value={draggedExplorerPaths}>
			{children}
		</ExplorerDragPathsContext.Provider>
	)
}

export function useDraggedExplorerPaths() {
	return useContext(ExplorerDragPathsContext)
}

export function useIsHoveredExplorerDropPath(path: string) {
	return useSyncExternalStore(
		hoveredExplorerDropPathStore.subscribe,
		() => hoveredExplorerDropPathStore.getSnapshot() === path,
		() => false,
	)
}

export function setHoveredExplorerDropPath(path: string | null) {
	hoveredExplorerDropPathStore.setSnapshot(path)
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
