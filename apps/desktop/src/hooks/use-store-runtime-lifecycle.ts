import { useEffect, useRef } from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"

type StoreRuntimeLifecyclePorts = {
	loadAISettings: () => Promise<void>
	loadHotkeys: () => Promise<void>
	fetchOllamaModels: () => Promise<void>
}

export const initializeStoreRuntime = ({
	loadAISettings,
	loadHotkeys,
	fetchOllamaModels,
}: StoreRuntimeLifecyclePorts) => {
	void loadAISettings()
	void loadHotkeys()
	void fetchOllamaModels()
}

export function useStoreRuntimeLifecycle() {
	const { loadAISettings, loadHotkeys, fetchOllamaModels } = useStore(
		useShallow((state) => ({
			loadAISettings: state.loadAISettings,
			loadHotkeys: state.loadHotkeys,
			fetchOllamaModels: state.fetchOllamaModels,
		})),
	)
	const hasInitializedRef = useRef(false)

	useEffect(() => {
		if (hasInitializedRef.current) {
			return
		}

		hasInitializedRef.current = true
		initializeStoreRuntime({
			loadAISettings,
			loadHotkeys,
			fetchOllamaModels,
		})
	}, [fetchOllamaModels, loadAISettings, loadHotkeys])
}
