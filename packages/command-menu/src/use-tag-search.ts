import { useEffect, useRef, useState } from "react"
import type { CommandMenuTagResult, CommandMenuTagSearch } from "./types"

export const useTagSearch = (
	query: string | null,
	workspacePath: string | null,
	searchTags?: CommandMenuTagSearch,
) => {
	const [results, setResults] = useState<CommandMenuTagResult[]>([])
	const requestIdRef = useRef(0)

	useEffect(() => {
		const requestId = requestIdRef.current + 1
		requestIdRef.current = requestId

		if (!searchTags || !workspacePath || !query) {
			setResults([])
			return
		}

		searchTags(query, workspacePath)
			.then((nextResults) => {
				if (requestIdRef.current === requestId) {
					setResults(nextResults)
				}
			})
			.catch((error) => {
				if (requestIdRef.current === requestId) {
					console.error("Failed to search tags:", error)
					setResults([])
				}
			})
	}, [query, searchTags, workspacePath])

	return {
		results,
	}
}
