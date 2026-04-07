import { isPathEqualOrDescendant } from "@mdit/utils/path-utils"
import type { StoreApi } from "zustand"
import { computeCollectionEntries } from "../../collection/helpers/collection-entries"
import type { WorkspaceEntry } from "../workspace-state"

type EntryCreatedInput = {
	parentPath: string
	entry: WorkspaceEntry
	expandParent?: boolean
	expandNewDirectory?: boolean
}

type EntriesDeletedInput = {
	paths: string[]
}

type EntryRenamedInput = {
	oldPath: string
	newPath: string
	isDirectory: boolean
	newName: string
	clearSyncedName?: boolean
}

type EntryMovedInput = {
	sourcePath: string
	destinationDirPath: string
	newPath: string
	isDirectory: boolean
	refreshContent?: boolean
}

export type WorkspaceCollectionState = {
	currentCollectionPath: string | null
	lastCollectionPath: string | null
	collectionEntries: WorkspaceEntry[]
}

export type WorkspaceCollectionActions = {
	setCurrentCollectionPath: (
		path: string | null | ((prev: string | null) => string | null),
	) => void
	resetCollectionPath: () => void
	toggleCollectionView: () => void
	refreshCollectionEntries: () => void
	onEntryCreated: (input: EntryCreatedInput) => void
	onEntriesDeleted: (input: EntriesDeletedInput) => void
	onEntryRenamed: (input: EntryRenamedInput) => void
	onEntryMoved: (input: EntryMovedInput) => void
}

export type WorkspaceCollectionSlice = WorkspaceCollectionState &
	WorkspaceCollectionActions

type CollectionStoreState = WorkspaceCollectionState & {
	entries: WorkspaceEntry[]
}

const replacePathPrefixIfDescendant = (
	path: string | null,
	oldPath: string,
	newPath: string,
): string | null => {
	if (!path || !isPathEqualOrDescendant(path, oldPath)) {
		return path
	}

	if (path === oldPath) {
		return newPath
	}

	return `${newPath}${path.slice(oldPath.length)}`
}

export const buildWorkspaceCollectionState = (
	overrides?: Partial<WorkspaceCollectionState>,
): WorkspaceCollectionState => ({
	currentCollectionPath: null,
	lastCollectionPath: null,
	collectionEntries: [],
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
					collectionEntries: computeCollectionEntries(nextPath, get().entries),
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
					collectionEntries: [],
				})
			} else if (lastCollectionPath !== null) {
				setCollectionState({
					currentCollectionPath: lastCollectionPath,
					collectionEntries: computeCollectionEntries(
						lastCollectionPath,
						get().entries,
					),
				})
			}
		},

		refreshCollectionEntries: () => {
			setCollectionState((state) => ({
				collectionEntries: computeCollectionEntries(
					state.currentCollectionPath,
					get().entries,
				),
			}))
		},

		onEntryCreated: (_input) => {
			setCollectionState((state) => ({
				collectionEntries: computeCollectionEntries(
					state.currentCollectionPath,
					get().entries,
				),
			}))
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
					collectionEntries: computeCollectionEntries(
						nextCurrentCollectionPath,
						get().entries,
					),
				}
			})
		},

		onEntryRenamed: ({ oldPath, newPath, isDirectory }) => {
			setCollectionState((state) => {
				const nextCurrentCollectionPath = isDirectory
					? replacePathPrefixIfDescendant(
							state.currentCollectionPath,
							oldPath,
							newPath,
						)
					: state.currentCollectionPath
				const nextLastCollectionPath = isDirectory
					? replacePathPrefixIfDescendant(
							state.lastCollectionPath,
							oldPath,
							newPath,
						)
					: state.lastCollectionPath

				return {
					currentCollectionPath: nextCurrentCollectionPath,
					lastCollectionPath: nextLastCollectionPath,
					collectionEntries: computeCollectionEntries(
						nextCurrentCollectionPath,
						get().entries,
					),
				}
			})
		},

		onEntryMoved: ({ sourcePath, newPath, isDirectory }) => {
			setCollectionState((state) => {
				const nextCurrentCollectionPath = isDirectory
					? replacePathPrefixIfDescendant(
							state.currentCollectionPath,
							sourcePath,
							newPath,
						)
					: state.currentCollectionPath
				const nextLastCollectionPath = isDirectory
					? replacePathPrefixIfDescendant(
							state.lastCollectionPath,
							sourcePath,
							newPath,
						)
					: state.lastCollectionPath

				return {
					currentCollectionPath: nextCurrentCollectionPath,
					lastCollectionPath: nextLastCollectionPath,
					collectionEntries: computeCollectionEntries(
						nextCurrentCollectionPath,
						get().entries,
					),
				}
			})
		},
	}
}
