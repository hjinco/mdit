import { createStore } from "zustand/vanilla"

export type StateSource<T> = {
	getSnapshot: () => T
	subscribe: (listener: () => void) => () => void
}

export function createState<T extends object>(initial: T) {
	const store = createStore<T>(() => initial)

	return {
		getSnapshot: store.getState,
		subscribe: store.subscribe,
		update(patch: Partial<T> | ((current: T) => Partial<T>)) {
			store.setState(patch)
		},
	}
}
