import { isPathEqualOrDescendant } from "@mdit/utils/path-utils"
import type { StoreApi } from "zustand"

type EntriesDeletedInput = {
	paths: string[]
}

type EntryRenamedInput = {
	sourcePath: string
	targetPath: string
	isDirectory: boolean
}

type EntryMovedInput = {
	sourcePath: string
	targetPath: string
	isDirectory: boolean
}

export type WorkspaceCollectionState = {
	currentCollectionPath: string | null
	lastCollectionPath: string | null
}

export type WorkspaceCollectionActions = {
	setCurrentCollectionPath: (
		path: string | null | ((prev: string | null) => string | null),
	) => void
	resetCollectionPath: () => void
	toggleCollectionView: () => void
	onEntriesDeleted: (input: EntriesDeletedInput) => void
	onEntryRenamed: (input: EntryRenamedInput) => void
	onEntryMoved: (input: EntryMovedInput) => void
}

export type WorkspaceCollectionSlice = WorkspaceCollectionState &
	WorkspaceCollectionActions

type CollectionStoreState = WorkspaceCollectionState

const replacePathPrefixIfDescendant = (
	path: string | null,
	sourcePath: string,
	targetPath: string,
): string | null => {
	if (!path || !isPathEqualOrDescendant(path, sourcePath)) {
		return path
	}

	if (path === sourcePath) {
		return targetPath
	}

	return `${targetPath}${path.slice(sourcePath.length)}`
}

const rebaseCollectionPaths = (
	state: WorkspaceCollectionState,
	sourcePath: string,
	targetPath: string,
	isDirectory: boolean,
): WorkspaceCollectionState => {
	if (!isDirectory) {
		return state
	}

	return {
		currentCollectionPath: replacePathPrefixIfDescendant(
			state.currentCollectionPath,
			sourcePath,
			targetPath,
		),
		lastCollectionPath: replacePathPrefixIfDescendant(
			state.lastCollectionPath,
			sourcePath,
			targetPath,
		),
	}
}

export const buildWorkspaceCollectionState = (
	overrides?: Partial<WorkspaceCollectionState>,
): WorkspaceCollectionState => ({
	currentCollectionPath: null,
	lastCollectionPath: null,
	...overrides,
})

export const createWorkspaceCollectionActions = <
	TStoreState extends CollectionStoreState,
>(
	set: StoreApi<TStoreState>["setState"],
	get: StoreApi<TStoreState>["getState"],
): WorkspaceCollectionActions => {
	const setCollectionState = (
		partial:
			| Partial<WorkspaceCollectionState>
			| ((state: TStoreState) => Partial<WorkspaceCollectionState>),
	) => {
		set(
			partial as
				| Partial<TStoreState>
				| ((state: TStoreState) => Partial<TStoreState>),
		)
	}

	return {
		setCurrentCollectionPath: (path) => {
			setCollectionState((state) => {
				const nextPath =
					typeof path === "function" ? path(state.currentCollectionPath) : path
				return {
					currentCollectionPath: nextPath,
					lastCollectionPath:
						nextPath !== null ? nextPath : state.lastCollectionPath,
				}
			})
		},

		resetCollectionPath: () => {
			setCollectionState(buildWorkspaceCollectionState())
		},

		toggleCollectionView: () => {
			const { currentCollectionPath, lastCollectionPath } = get()
			if (currentCollectionPath !== null) {
				setCollectionState({
					currentCollectionPath: null,
				})
			} else if (lastCollectionPath !== null) {
				setCollectionState({
					currentCollectionPath: lastCollectionPath,
				})
			}
		},

		onEntriesDeleted: ({ paths }) => {
			setCollectionState((state) => {
				const { currentCollectionPath, lastCollectionPath } = state
				const shouldClearCurrentCollectionPath =
					currentCollectionPath !== null &&
					paths.some((path) =>
						isPathEqualOrDescendant(currentCollectionPath, path),
					)
				const shouldClearLastCollectionPath =
					lastCollectionPath !== null &&
					paths.some((path) =>
						isPathEqualOrDescendant(lastCollectionPath, path),
					)

				const nextCurrentCollectionPath = shouldClearCurrentCollectionPath
					? null
					: currentCollectionPath
				const nextLastCollectionPath = shouldClearLastCollectionPath
					? null
					: lastCollectionPath

				return {
					currentCollectionPath: nextCurrentCollectionPath,
					lastCollectionPath: nextLastCollectionPath,
				}
			})
		},

		onEntryRenamed: ({ sourcePath, targetPath, isDirectory }) => {
			setCollectionState((state) =>
				rebaseCollectionPaths(state, sourcePath, targetPath, isDirectory),
			)
		},

		onEntryMoved: ({ sourcePath, targetPath, isDirectory }) => {
			setCollectionState((state) =>
				rebaseCollectionPaths(state, sourcePath, targetPath, isDirectory),
			)
		},
	}
}
