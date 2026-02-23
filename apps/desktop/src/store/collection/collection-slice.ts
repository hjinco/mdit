import type { StateCreator } from "zustand"
import { isPathEqualOrDescendant } from "@/utils/path-utils"
import type {
	WorkspaceEntry,
	WorkspaceSlice,
} from "../workspace/workspace-slice"
import { computeCollectionEntries } from "./helpers/collection-entries"

type EntryCreatedInput = Parameters<WorkspaceSlice["entryCreated"]>[0]
type EntriesDeletedInput = Parameters<WorkspaceSlice["entriesDeleted"]>[0]
type EntryRenamedInput = Parameters<WorkspaceSlice["entryRenamed"]>[0]
type EntryMovedInput = Parameters<WorkspaceSlice["entryMoved"]>[0]

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

export type CollectionSlice = {
	currentCollectionPath: string | null
	lastCollectionPath: string | null
	collectionEntries: WorkspaceEntry[]
	setCurrentCollectionPath: (
		path: string | null | ((prev: string | null) => string | null),
	) => void
	clearLastCollectionPath: () => void
	resetCollectionPath: () => void
	toggleCollectionView: () => void
	refreshCollectionEntries: () => void
	onEntryCreated: (input: EntryCreatedInput) => void
	onEntriesDeleted: (input: EntriesDeletedInput) => void
	onEntryRenamed: (input: EntryRenamedInput) => void
	onEntryMoved: (input: EntryMovedInput) => void
}

export const prepareCollectionSlice =
	(): StateCreator<CollectionSlice & WorkspaceSlice, [], [], CollectionSlice> =>
	(set, get) => ({
		currentCollectionPath: null,
		lastCollectionPath: null,
		collectionEntries: [],

		setCurrentCollectionPath: (path) => {
			set((state) => {
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

		clearLastCollectionPath: () => {
			set({
				lastCollectionPath: null,
			})
		},

		resetCollectionPath: () => {
			set({
				currentCollectionPath: null,
				lastCollectionPath: null,
				collectionEntries: [],
			})
		},

		toggleCollectionView: () => {
			const { currentCollectionPath, lastCollectionPath } = get()
			if (currentCollectionPath !== null) {
				// Close the view
				set({ currentCollectionPath: null, collectionEntries: [] })
			} else if (lastCollectionPath !== null) {
				// Restore the last opened path
				set({
					currentCollectionPath: lastCollectionPath,
					collectionEntries: computeCollectionEntries(
						lastCollectionPath,
						get().entries,
					),
				})
			}
		},

		refreshCollectionEntries: () => {
			set((state) => ({
				collectionEntries: computeCollectionEntries(
					state.currentCollectionPath,
					get().entries,
				),
			}))
		},

		onEntryCreated: () => {},

		onEntriesDeleted: ({ paths }) => {
			set((state) => {
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
			if (!isDirectory) {
				return
			}

			set((state) => {
				const nextCurrentCollectionPath = replacePathPrefixIfDescendant(
					state.currentCollectionPath,
					oldPath,
					newPath,
				)
				const nextLastCollectionPath = replacePathPrefixIfDescendant(
					state.lastCollectionPath,
					oldPath,
					newPath,
				)

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
			if (!isDirectory) {
				return
			}

			set((state) => {
				const nextCurrentCollectionPath = replacePathPrefixIfDescendant(
					state.currentCollectionPath,
					sourcePath,
					newPath,
				)
				const nextLastCollectionPath = replacePathPrefixIfDescendant(
					state.lastCollectionPath,
					sourcePath,
					newPath,
				)

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
	})

export const createCollectionSlice = prepareCollectionSlice()
