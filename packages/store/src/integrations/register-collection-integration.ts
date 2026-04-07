import type { MditStore } from ".."
import type { StoreEventHub } from "./store-events"

export const registerCollectionIntegration = (
	store: MditStore,
	events: StoreEventHub,
) =>
	events.subscribe((event) => {
		const state = store.getState()

		switch (event.type) {
			case "workspace/reset": {
				state.resetCollectionPath()
				return
			}
			case "workspace/entries-replaced": {
				if (state.workspacePath !== event.workspacePath) {
					return
				}

				state.refreshCollectionEntries()
				return
			}
			case "workspace/entry-created": {
				if (state.workspacePath !== event.workspacePath) {
					return
				}

				state.onEntryCreated({
					parentPath: event.parentPath,
					entry: event.entry,
					expandParent: event.expandParent,
					expandNewDirectory: event.expandNewDirectory,
				})
				return
			}
			case "workspace/entries-deleted": {
				if (state.workspacePath !== event.workspacePath) {
					return
				}

				state.onEntriesDeleted({ paths: event.paths })
				return
			}
			case "workspace/entry-renamed": {
				if (state.workspacePath !== event.workspacePath) {
					return
				}

				state.onEntryRenamed({
					oldPath: event.oldPath,
					newPath: event.newPath,
					isDirectory: event.isDirectory,
					newName: event.newName,
				})
				return
			}
			case "workspace/entry-moved": {
				if (state.workspacePath !== event.workspacePath) {
					return
				}

				state.onEntryMoved({
					sourcePath: event.sourcePath,
					destinationDirPath: event.destinationDirPath,
					newPath: event.newPath,
					isDirectory: event.isDirectory,
				})
				return
			}
			default:
				return
		}
	})
