import { useEffect } from "react"
import { useStore } from "@/store"

const INDEXING_META_POLL_INTERVAL_MS = 5000

export function useIndexingMetaPolling(
	workspacePath: string | null,
	enabled: boolean,
) {
	const loadIndexingMeta = useStore((state) => state.loadIndexingMeta)

	useEffect(() => {
		if (!workspacePath) {
			return
		}

		void loadIndexingMeta(workspacePath)

		if (!enabled) {
			return
		}

		const intervalId = window.setInterval(() => {
			void useStore.getState().loadIndexingMeta(workspacePath)
		}, INDEXING_META_POLL_INTERVAL_MS)

		return () => {
			window.clearInterval(intervalId)
		}
	}, [workspacePath, enabled, loadIndexingMeta])
}
