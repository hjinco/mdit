import {
	type CommandMenuContentMatch,
	type CommandMenuSemanticResult,
	CommandMenu as SharedCommandMenu,
} from "@mdit/command-menu"
import { invoke } from "@tauri-apps/api/core"
import { useCallback, useEffect } from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"
import { searchMarkdownContent } from "./utils/note-content-search"

type QuerySearchEntry = {
	path: string
	name: string
	createdAt?: number
	modifiedAt?: number
	similarity: number
}

export function CommandMenu() {
	const {
		entries,
		workspacePath,
		openTab,
		isCommandMenuOpen,
		setCommandMenuOpen,
		getIndexingConfig,
	} = useStore(
		useShallow((state) => ({
			entries: state.entries,
			workspacePath: state.workspacePath,
			openTab: state.openTab,
			isCommandMenuOpen: state.isCommandMenuOpen,
			setCommandMenuOpen: state.setCommandMenuOpen,
			getIndexingConfig: state.getIndexingConfig,
		})),
	)

	useEffect(() => {
		if (!workspacePath) {
			return
		}

		getIndexingConfig(workspacePath).catch((error) => {
			console.error("Failed to load indexing config:", error)
		})
	}, [getIndexingConfig, workspacePath])

	const handleSelectNote = useCallback(
		(notePath: string) => {
			openTab(notePath)
		},
		[openTab],
	)

	const searchContent = useCallback(
		(
			query: string,
			currentWorkspacePath: string,
		): Promise<CommandMenuContentMatch[]> =>
			searchMarkdownContent(query, currentWorkspacePath),
		[],
	)

	const searchSemantic = useCallback(
		async (
			query: string,
			currentWorkspacePath: string,
		): Promise<CommandMenuSemanticResult[]> => {
			const results = await invoke<QuerySearchEntry[]>(
				"search_query_entries_command",
				{
					workspacePath: currentWorkspacePath,
					query,
				},
			)

			return results.map((entry) => ({
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
			}))
		},
		[],
	)

	return (
		<SharedCommandMenu
			open={isCommandMenuOpen}
			onOpenChange={setCommandMenuOpen}
			workspacePath={workspacePath}
			entries={entries}
			onSelectPath={handleSelectNote}
			searchContent={searchContent}
			searchSemantic={searchSemantic}
		/>
	)
}
