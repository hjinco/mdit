import { type UnwatchFn, watch } from '@tauri-apps/plugin-fs'
import { create } from 'zustand'
import { hasHiddenEntryInPaths } from '@/utils/path-utils'
import { useWorkspaceStore } from './workspace-store'

type WorkspaceWatchStore = {
  unwatchFn: UnwatchFn | null
  watchWorkspace: () => Promise<void>
  unwatchWorkspace: () => void
}

export const useWorkspaceWatchStore = create<WorkspaceWatchStore>(
  (set, get) => ({
    unwatchFn: null,

    watchWorkspace: async () => {
      const workspaceStore = useWorkspaceStore.getState()
      const workspacePath = workspaceStore.workspacePath
      if (!workspacePath) {
        return
      }

      // Unwatch previous watch if exists
      const currentUnwatch = get().unwatchFn
      if (currentUnwatch) {
        currentUnwatch()
      }

      const unwatch = await watch(
        workspacePath,
        (event) => {
          // Skip events with paths containing dot folders
          if (hasHiddenEntryInPaths(event.paths)) {
            return
          }

          // Skip events that occurred within 2 seconds of an internal FS operation
          const lastFsOpTime = useWorkspaceStore.getState().lastFsOperationTime
          if (lastFsOpTime !== null && Date.now() - lastFsOpTime < 5000) {
            return
          }

          const workspaceStoreState = useWorkspaceStore.getState()

          workspaceStoreState.refreshWorkspaceEntries()

          // Handle rename events for files moving in/out of workspace
          // if (
          //   event.type &&
          //   typeof event.type === 'object' &&
          //   'modify' in event.type &&
          //   event.type.modify &&
          //   typeof event.type.modify === 'object' &&
          //   'kind' in event.type.modify &&
          //   event.type.modify.kind === 'rename' &&
          //   event.paths.length === 1
          // ) {
          //   const path = event.paths[0]
          //   const currentEntries = workspaceStoreState.entries
          //   const existingEntry = findEntryByPath(currentEntries, path)

          //   if (existingEntry) {
          //     // Entry exists → file moved out of workspace, remove it
          //     useWorkspaceStore.setState((state) => ({
          //       entries: removeEntriesFromState(state.entries, [path]),
          //     }))
          //     return
          //   }
          //   // Entry doesn't exist → file moved into workspace, add it
          //   ;(async () => {
          //     const fileStat = await stat(path)
          //     const isDirectory = fileStat.isDirectory
          //     const fileName = getFileNameFromPath(path)
          //     const parentPath = await dirname(path)

          //     const newEntry: WorkspaceEntry = {
          //       path,
          //       name: fileName,
          //       isDirectory,
          //       children: isDirectory ? [] : undefined,
          //       createdAt: fileStat.birthtime
          //         ? new Date(fileStat.birthtime)
          //         : undefined,
          //       modifiedAt: fileStat.mtime
          //         ? new Date(fileStat.mtime)
          //         : undefined,
          //     }

          //     // If it's a directory, build its children
          //     if (isDirectory) {
          //       try {
          //         const children = await buildWorkspaceEntries(path)
          //         newEntry.children = children
          //       } catch (error) {
          //         console.error(
          //           'Failed to build children for moved directory:',
          //           path,
          //           error
          //         )
          //         newEntry.children = []
          //       }
          //     }

          //     const currentWorkspacePath =
          //       useWorkspaceStore.getState().workspacePath
          //     if (currentWorkspacePath !== workspacePath) {
          //       return
          //     }

          //     useWorkspaceStore.setState((state) => {
          //       if (parentPath === workspacePath) {
          //         // Moving to workspace root
          //         return {
          //           entries: sortWorkspaceEntries([...state.entries, newEntry]),
          //         }
          //       }
          //       // Moving to a subdirectory
          //       return {
          //         entries: addEntryToState(state.entries, parentPath, newEntry),
          //       }
          //     })
          //   })()
          //   return
          // }

          // // Handle rename events for files moving within workspace
          // if (
          //   event.type &&
          //   typeof event.type === 'object' &&
          //   'modify' in event.type &&
          //   event.type.modify &&
          //   typeof event.type.modify === 'object' &&
          //   'kind' in event.type.modify &&
          //   event.type.modify.kind === 'rename' &&
          //   'mode' in event.type.modify &&
          //   event.type.modify.mode === 'both' &&
          //   event.paths.length === 2
          // ) {
          //   const oldPath = event.paths[0]
          //   const newPath = event.paths[1]
          //   const currentWorkspacePath =
          //     useWorkspaceStore.getState().workspacePath

          //   if (!currentWorkspacePath) {
          //     return
          //   }
          //   // Handle asynchronously
          //   ;(async () => {
          //     // Find the entry to move
          //     const currentEntries = useWorkspaceStore.getState().entries
          //     const entryToMove = findEntryByPath(currentEntries, oldPath)

          //     if (!entryToMove) {
          //       // Entry not found, skip
          //       return
          //     }

          //     // Verify workspace path hasn't changed
          //     if (
          //       useWorkspaceStore.getState().workspacePath !==
          //       currentWorkspacePath
          //     ) {
          //       return
          //     }

          //     const isDirectory = entryToMove.isDirectory
          //     const destinationPath = await dirname(newPath)

          //     // Update tab if the moved file is currently open
          //     const tabState = useTabStore.getState()
          //     if (tabState.tab?.path === oldPath) {
          //       await tabState.renameTab(oldPath, newPath)
          //       tabState.updateHistoryPath(oldPath, newPath)
          //     }

          //     // Verify workspace path hasn't changed again before updating state
          //     if (
          //       useWorkspaceStore.getState().workspacePath !==
          //       currentWorkspacePath
          //     ) {
          //       return
          //     }

          //     const { currentCollectionPath } = useWorkspaceStore.getState()
          //     const shouldUpdateCollectionPath =
          //       currentCollectionPath === oldPath

          //     let nextPinned: string[] | null = null

          //     useWorkspaceStore.setState((state) => {
          //       let updatedEntries: WorkspaceEntry[]

          //       if (destinationPath === currentWorkspacePath) {
          //         // Moving to workspace root - add directly to entries array
          //         // First, remove from source location
          //         const removeEntry = (
          //           entryList: WorkspaceEntry[]
          //         ): WorkspaceEntry[] => {
          //           return entryList
          //             .filter((entry) => entry.path !== oldPath)
          //             .map((entry) => {
          //               if (entry.children) {
          //                 return {
          //                   ...entry,
          //                   children: removeEntry(entry.children),
          //                 }
          //               }
          //               return entry
          //             })
          //         }

          //         const filteredEntries = removeEntry(state.entries)

          //         // Update paths if it's a directory
          //         let updatedEntryToMove: WorkspaceEntry
          //         if (entryToMove.isDirectory) {
          //           updatedEntryToMove = {
          //             path: newPath,
          //             name: getFileNameFromPath(newPath),
          //             isDirectory: true,
          //             children: entryToMove.children
          //               ? entryToMove.children.map((child: WorkspaceEntry) =>
          //                   updateChildPathsForMove(child, oldPath, newPath)
          //                 )
          //               : undefined,
          //             createdAt: entryToMove.createdAt,
          //             modifiedAt: entryToMove.modifiedAt,
          //           }
          //         } else {
          //           updatedEntryToMove = {
          //             path: newPath,
          //             name: getFileNameFromPath(newPath),
          //             isDirectory: false,
          //             createdAt: entryToMove.createdAt,
          //             modifiedAt: entryToMove.modifiedAt,
          //           }
          //         }

          //         // Add directly to entries array
          //         updatedEntries = sortWorkspaceEntries([
          //           ...filteredEntries,
          //           updatedEntryToMove,
          //         ])
          //       } else {
          //         // Moving to a subdirectory - remove from source and add to destination with actual newPath
          //         // First, remove from source location
          //         const removeEntry = (
          //           entryList: WorkspaceEntry[]
          //         ): WorkspaceEntry[] => {
          //           return entryList
          //             .filter((entry) => entry.path !== oldPath)
          //             .map((entry) => {
          //               if (entry.children) {
          //                 return {
          //                   ...entry,
          //                   children: removeEntry(entry.children),
          //                 }
          //               }
          //               return entry
          //             })
          //         }

          //         const filteredEntries = removeEntry(state.entries)

          //         // Update paths if it's a directory
          //         const updatedEntryToMove: WorkspaceEntry = {
          //           path: newPath,
          //           name: getFileNameFromPath(newPath),
          //           isDirectory: entryToMove.isDirectory,
          //           createdAt: entryToMove.createdAt,
          //           modifiedAt: entryToMove.modifiedAt,
          //           ...(entryToMove.isDirectory && {
          //             children: entryToMove.children
          //               ? entryToMove.children.map((child: WorkspaceEntry) =>
          //                   updateChildPathsForMove(child, oldPath, newPath)
          //                 )
          //               : undefined,
          //           }),
          //         }

          //         // Add to destination using addEntryToState
          //         updatedEntries = addEntryToState(
          //           filteredEntries,
          //           destinationPath,
          //           updatedEntryToMove
          //         )
          //       }

          //       const updatedExpanded = isDirectory
          //         ? renameExpandedDirectories(
          //             state.expandedDirectories,
          //             oldPath,
          //             newPath
          //           )
          //         : state.expandedDirectories

          //       const updatedPinned = isDirectory
          //         ? renamePinnedDirectories(
          //             state.pinnedDirectories,
          //             oldPath,
          //             newPath
          //           )
          //         : state.pinnedDirectories
          //       const pinsChanged =
          //         updatedPinned.length !== state.pinnedDirectories.length ||
          //         updatedPinned.some(
          //           (path, index) => path !== state.pinnedDirectories[index]
          //         )

          //       if (pinsChanged) {
          //         nextPinned = updatedPinned
          //       }

          //       return {
          //         entries: updatedEntries,
          //         expandedDirectories: updatedExpanded,
          //         currentCollectionPath: shouldUpdateCollectionPath
          //           ? newPath
          //           : state.currentCollectionPath,
          //         ...(pinsChanged ? { pinnedDirectories: updatedPinned } : {}),
          //       }
          //     })

          //     if (
          //       currentWorkspacePath &&
          //       nextPinned &&
          //       useWorkspaceStore.getState().workspacePath ===
          //         currentWorkspacePath
          //     ) {
          //       await persistPinnedDirectories(currentWorkspacePath, nextPinned)
          //     }
          //   })()
          //   return
          // }

          // // Handle create events for files and folders
          // if (
          //   event.type &&
          //   typeof event.type === 'object' &&
          //   'create' in event.type &&
          //   event.type.create &&
          //   typeof event.type.create === 'object' &&
          //   'kind' in event.type.create &&
          //   (event.type.create.kind === 'folder' ||
          //     event.type.create.kind === 'file') &&
          //   event.paths.length === 1
          // ) {
          //   const path = event.paths[0]
          //   const currentWorkspacePath =
          //     useWorkspaceStore.getState().workspacePath

          //   // Verify the path is within the workspace
          //   if (
          //     !currentWorkspacePath ||
          //     !isPathEqualOrDescendant(path, currentWorkspacePath)
          //   ) {
          //     return
          //   }

          //   // Check if entry already exists to avoid duplicates
          //   const currentEntries = useWorkspaceStore.getState().entries
          //   const existingEntry = findEntryByPath(currentEntries, path)
          //   if (existingEntry) {
          //     return
          //   }
          //   // Add the new entry asynchronously
          //   ;(async () => {
          //     const fileStat = await stat(path)
          //     const isDirectory = fileStat.isDirectory
          //     const fileName = getFileNameFromPath(path)
          //     const parentPath = await dirname(path)

          //     const newEntry: WorkspaceEntry = {
          //       path,
          //       name: fileName,
          //       isDirectory,
          //       children: isDirectory ? [] : undefined,
          //       createdAt: fileStat.birthtime
          //         ? new Date(fileStat.birthtime)
          //         : undefined,
          //       modifiedAt: fileStat.mtime
          //         ? new Date(fileStat.mtime)
          //         : undefined,
          //     }

          //     // If it's a directory, build its children
          //     if (isDirectory) {
          //       try {
          //         const children = await buildWorkspaceEntries(path)
          //         newEntry.children = children
          //       } catch {
          //         newEntry.children = []
          //       }
          //     }

          //     // Verify workspace path hasn't changed before updating state
          //     if (
          //       useWorkspaceStore.getState().workspacePath !==
          //       currentWorkspacePath
          //     ) {
          //       return
          //     }

          //     useWorkspaceStore.setState((state) => {
          //       if (parentPath === currentWorkspacePath) {
          //         // Created at workspace root
          //         return {
          //           entries: sortWorkspaceEntries([...state.entries, newEntry]),
          //         }
          //       }
          //       // Created in a subdirectory
          //       return {
          //         entries: addEntryToState(state.entries, parentPath, newEntry),
          //       }
          //     })
          //   })()
          //   return
          // }
        },
        {
          recursive: true,
          delayMs: 1500,
        }
      )

      // Verify workspace path hasn't changed before storing unwatch function
      if (useWorkspaceStore.getState().workspacePath !== workspacePath) {
        unwatch()
        return
      }

      set({ unwatchFn: unwatch })
    },

    unwatchWorkspace: () => {
      const unwatchFn = get().unwatchFn
      if (unwatchFn) {
        unwatchFn()
        set({ unwatchFn: null })
      }
    },
  })
)
