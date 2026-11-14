import { useCallback, useState } from "react"

export function useOllamaModelRefresh(fetchOllamaModels: () => Promise<void>) {
	const [isRefreshingModels, setIsRefreshingModels] = useState(false)

	const refreshOllamaModels = useCallback(async () => {
		setIsRefreshingModels(true)
		try {
			await fetchOllamaModels()
		} catch (error) {
			console.error("Failed to refresh Ollama models:", error)
		} finally {
			setIsRefreshingModels(false)
		}
	}, [fetchOllamaModels])

	return {
		isRefreshingModels,
		refreshOllamaModels,
	}
}
