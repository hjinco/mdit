import type { MditStore } from ".."
import type { StoreEventHub } from "./store-events"

export const registerTabPathIntegration = (
	store: MditStore,
	events: StoreEventHub,
) =>
	events.subscribe(async (event) => {
		const state = store.getState()

		if (
			state.workspacePath == null ||
			state.workspacePath !== event.workspacePath
		) {
			return
		}

		switch (event.type) {
			case "workspace/tab-paths-removed": {
				state.removePathsFromHistory(event.paths)
				return
			}
			case "workspace/tab-path-renamed": {
				await state.renameTab(event.oldPath, event.newPath, {
					clearSyncedName: event.clearSyncedName,
				})
				state.updateHistoryPath(event.oldPath, event.newPath)
				return
			}
			case "workspace/tab-path-moved": {
				await state.renameTab(event.sourcePath, event.newPath, {
					refreshContent: event.refreshContent,
				})
				state.updateHistoryPath(event.sourcePath, event.newPath)
				return
			}
			default:
				return
		}
	})
