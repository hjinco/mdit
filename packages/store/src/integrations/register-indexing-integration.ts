import type { MditStore } from ".."
import type { StoreEventHub } from "./store-events"

export const registerIndexingIntegration = (
	store: MditStore,
	events: StoreEventHub,
) =>
	events.subscribe((event) => {
		const state = store.getState()

		if (event.type === "workspace/reset") {
			state.resetIndexingState()
			return
		}

		if (event.type === "workspace/loaded") {
			return state
				.getIndexingConfig(event.workspacePath)
				.then(() => undefined)
				.catch((error) => {
					console.error("Failed to preload indexing config:", error)
				})
		}
	})
