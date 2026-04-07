import type { MditStore } from ".."
import type { StoreEventHub } from "./store-events"

const closeWorkspaceTabs = (
	store: MditStore,
	clearHistoryWhenNoActiveTab: boolean,
) => {
	const state = store.getState()
	const openTabSnapshots = state.getOpenTabSnapshots()
	const activeTabPath = state.getActiveTabPath()

	if (activeTabPath || openTabSnapshots.length > 0) {
		state.closeAllTabs()
	}

	if (openTabSnapshots.length > 0 || clearHistoryWhenNoActiveTab) {
		state.clearHistory()
	}
}

export const registerTabLifecycleIntegration = (
	store: MditStore,
	events: StoreEventHub,
) =>
	events.subscribe(async (event) => {
		const state = store.getState()

		switch (event.type) {
			case "workspace/tab-reset-requested": {
				closeWorkspaceTabs(store, event.clearHistoryWhenNoActiveTab)
				return
			}
			case "workspace/note-created": {
				if (
					event.workspacePath !== null &&
					state.workspacePath !== event.workspacePath
				) {
					return
				}

				await state.openTab(event.path)
				return
			}
			case "workspace/opened-files-restore-requested": {
				if (state.workspacePath !== event.workspacePath) {
					return
				}

				const hydrated = await state.hydrateFromOpenedFiles(event.paths)
				if (!hydrated) {
					console.debug("Failed to hydrate opened file history")
				}
				return
			}
			case "workspace/tab-content-refresh-requested": {
				if (state.workspacePath !== event.workspacePath) {
					return
				}

				state.refreshTabFromExternalContent(event.path, event.content, {
					preserveSelection: event.preserveSelection,
				})
				return
			}
			default:
				return
		}
	})
