import { invoke } from "@tauri-apps/api/core"
import { useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "@/store"
import type { QuerySearchEntry } from "@/types/query-search-entry"

export type SemanticNoteSearchResult = {
	path: string
	name: string
	similarity: number
	createdAt?: Date
	modifiedAt?: Date
}

export function useSemanticNoteSearch(
	query: string,
	workspacePath: string | null,
) {
	const [results, setResults] = useState<SemanticNoteSearchResult[]>([])
	const requestIdRef = useRef(0)

	const getIndexingConfig = useStore((state) => state.getIndexingConfig)
	const indexingConfig = useStore((state) =>
		workspacePath ? (state.configs[workspacePath] ?? null) : null,
	)

	const trimmedQuery = useMemo(() => query.trim(), [query])
	const embeddingProvider = indexingConfig?.embeddingProvider ?? ""
	const embeddingModel = indexingConfig?.embeddingModel ?? ""
	const hasEmbeddingConfig = Boolean(embeddingProvider && embeddingModel)

	useEffect(() => {
		if (!workspacePath) {
			return
		}

		getIndexingConfig(workspacePath).catch((error) => {
			console.error("Failed to load indexing config:", error)
		})
	}, [workspacePath, getIndexingConfig])

	useEffect(() => {
		const requestId = requestIdRef.current + 1
		requestIdRef.current = requestId

		if (!workspacePath || trimmedQuery.length === 0 || !hasEmbeddingConfig) {
			setResults([])
			return
		}

		invoke<QuerySearchEntry[]>("search_query_entries_command", {
			workspacePath,
			query: trimmedQuery,
			embeddingProvider,
			embeddingModel,
		})
			.then((entries) => {
				if (requestIdRef.current !== requestId) {
					return
				}

				setResults(
					entries.map((entry) => ({
						path: entry.path,
						name: entry.name,
						similarity: entry.similarity,
						createdAt:
							typeof entry.createdAt === "number"
								? new Date(entry.createdAt)
								: undefined,
						modifiedAt:
							typeof entry.modifiedAt === "number"
								? new Date(entry.modifiedAt)
								: undefined,
					})),
				)
			})
			.catch((error) => {
				if (requestIdRef.current !== requestId) {
					return
				}

				console.error("Failed to perform semantic search:", error)
				setResults([])
			})
	}, [
		workspacePath,
		trimmedQuery,
		hasEmbeddingConfig,
		embeddingProvider,
		embeddingModel,
	])

	return {
		results,
		hasEmbeddingConfig,
	}
}
