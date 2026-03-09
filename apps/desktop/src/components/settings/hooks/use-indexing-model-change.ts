import { useCallback, useEffect, useRef, useState } from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"
import {
	isModelChanging,
	parseEmbeddingModelValue,
	shouldShowModelChangeWarning,
} from "@/store/indexing/helpers/indexing-utils"
import type { IndexingConfig } from "@/store/indexing/indexing-types"

type PendingModelChange = {
	provider: string
	model: string
}

export function useIndexingModelChange(
	workspacePath: string | null,
	currentConfig: IndexingConfig | null,
	indexedDocCount: number,
) {
	const { setIndexingConfig, refreshWorkspaceEmbeddings, loadIndexingMeta } =
		useStore(
			useShallow((state) => ({
				setIndexingConfig: state.setIndexingConfig,
				refreshWorkspaceEmbeddings: state.refreshWorkspaceEmbeddings,
				loadIndexingMeta: state.loadIndexingMeta,
			})),
		)
	const [isDialogOpen, setIsDialogOpen] = useState(false)
	const [pendingModelChange, setPendingModelChange] =
		useState<PendingModelChange | null>(null)
	const requestIdRef = useRef(0)
	const previousWorkspacePathRef = useRef<string | null>(workspacePath)

	const clearPendingModelChange = useCallback(() => {
		requestIdRef.current += 1
		setPendingModelChange(null)
		setIsDialogOpen(false)
	}, [])

	useEffect(() => {
		if (previousWorkspacePathRef.current === workspacePath) {
			return
		}

		previousWorkspacePathRef.current = workspacePath
		clearPendingModelChange()
	}, [workspacePath, clearPendingModelChange])

	const requestModelChange = useCallback(
		async (value: string | null) => {
			if (!workspacePath || !value) {
				return
			}

			const parsed = parseEmbeddingModelValue(value)
			if (!parsed) {
				return
			}

			const { provider, model } = parsed
			if (!isModelChanging(currentConfig, provider, model)) {
				return
			}

			if (shouldShowModelChangeWarning(true, indexedDocCount)) {
				setPendingModelChange({ provider, model })
				setIsDialogOpen(true)
				return
			}

			try {
				await setIndexingConfig(workspacePath, provider, model)
			} catch (error) {
				console.error("Failed to update embedding model:", error)
			}
		},
		[workspacePath, currentConfig, indexedDocCount, setIndexingConfig],
	)

	const confirmModelChange = useCallback(async () => {
		if (!workspacePath || !pendingModelChange) {
			return
		}

		const requestId = requestIdRef.current + 1
		requestIdRef.current = requestId

		try {
			await setIndexingConfig(
				workspacePath,
				pendingModelChange.provider,
				pendingModelChange.model,
			)
			await refreshWorkspaceEmbeddings(workspacePath)
			await loadIndexingMeta(workspacePath)
		} catch (error) {
			console.error("Failed to confirm embedding model change:", error)
		} finally {
			if (requestIdRef.current === requestId) {
				setPendingModelChange(null)
				setIsDialogOpen(false)
			}
		}
	}, [
		workspacePath,
		pendingModelChange,
		setIndexingConfig,
		refreshWorkspaceEmbeddings,
		loadIndexingMeta,
	])

	return {
		isDialogOpen,
		requestModelChange,
		confirmModelChange,
		cancelModelChange: clearPendingModelChange,
	}
}
