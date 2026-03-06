import { useEffect, useRef, useState } from "react"
import type {
	CommandMenuSemanticResult,
	CommandMenuSemanticSearch,
} from "./types"

export const useSemanticSearch = (
	query: string,
	workspacePath: string | null,
	searchSemantic?: CommandMenuSemanticSearch,
) => {
	const [results, setResults] = useState<CommandMenuSemanticResult[]>([])
	const requestIdRef = useRef(0)

	useEffect(() => {
		const requestId = requestIdRef.current + 1
		requestIdRef.current = requestId
		const trimmedQuery = query.trim()

		if (!searchSemantic || !workspacePath || trimmedQuery.length === 0) {
			setResults([])
			return
		}

		searchSemantic(trimmedQuery, workspacePath)
			.then((nextResults) => {
				if (requestIdRef.current === requestId) {
					setResults(nextResults)
				}
			})
			.catch((error) => {
				if (requestIdRef.current === requestId) {
					console.error("Failed to perform semantic search:", error)
					setResults([])
				}
			})
	}, [query, searchSemantic, workspacePath])

	return {
		results,
	}
}
