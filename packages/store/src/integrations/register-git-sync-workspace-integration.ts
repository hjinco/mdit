import type { MditStore } from ".."
import type { StoreEventHub } from "./store-events"

export const registerGitSyncWorkspaceIntegration = (
	store: MditStore,
	events: StoreEventHub,
) =>
	events.subscribe(async (event) => {
		if (event.type !== "git-sync/pulled-changes") {
			return
		}

		const state = store.getState()
		if (state.workspacePath !== event.workspacePath) {
			return
		}

		await state.refreshWorkspaceEntries()
	})
