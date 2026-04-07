export type StoreEvent =
	| { type: "workspace/reset"; workspacePath: string | null }
	| { type: "workspace/loaded"; workspacePath: string }
	| { type: "git-sync/pulled-changes"; workspacePath: string }

export type StoreEventListener = (event: StoreEvent) => void | Promise<void>

export type StoreEventHub = {
	emit: (event: StoreEvent) => Promise<void>
	subscribe: (listener: StoreEventListener) => () => void
}

export const createStoreEventHub = (): StoreEventHub => {
	const listeners = new Set<StoreEventListener>()

	return {
		emit: async (event) => {
			const pending = Array.from(listeners, (listener) => {
				try {
					return Promise.resolve(listener(event))
				} catch (error) {
					return Promise.reject(error)
				}
			})

			const settled = await Promise.allSettled(pending)
			const rejected = settled.find(
				(result): result is PromiseRejectedResult =>
					result.status === "rejected",
			)
			if (rejected) {
				throw rejected.reason
			}
		},
		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
	}
}
