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
			void state.getIndexingConfig(event.workspacePath).catch((error) => {
				console.error("Failed to preload indexing config:", error)
			})
		}
	})
