import {
	type CommandMenuContentMatch,
	type CommandMenuSemanticResult,
	type CommandMenuTagResult,
	CommandMenu as SharedCommandMenu,
} from "@mdit/command-menu"
import { invoke } from "@tauri-apps/api/core"
import { useCallback } from "react"
import { useShallow } from "zustand/shallow"
import { useDesktopRuntime, useWindowState, useWorkspaceState } from "@/state"

import { searchMarkdownContent } from "./utils/note-content-search"

type QuerySearchEntry = {
	path: string
	name: string
	createdAt?: number
	modifiedAt?: number
	similarity: number
}

type QueryTagEntry = {
	path: string
	name: string
	modifiedAt?: number
}

export function CommandMenu() {
	const { entries, workspacePath } = useWorkspaceState(
		useShallow((state) => ({
			entries: state.entries,
			workspacePath: state.workspacePath,
		})),
	)
	const openTab = useDesktopRuntime().documents.commands.openTab
	const { isCommandMenuOpen, commandMenuInitialQuery } = useWindowState(
		useShallow((state) => ({
			isCommandMenuOpen: state.isCommandMenuOpen,
			commandMenuInitialQuery: state.commandMenuInitialQuery,
		})),
	)
	const setCommandMenuOpen =
		useDesktopRuntime().window.commands.setCommandMenuOpen

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

	const searchTags = useCallback(
		async (
			query: string,
			currentWorkspacePath: string,
		): Promise<CommandMenuTagResult[]> => {
			const results = await invoke<QueryTagEntry[]>(
				"search_tag_entries_command",
				{
					workspacePath: currentWorkspacePath,
					tagQuery: query,
				},
			)

			return results.map((entry) => ({
				path: entry.path,
				name: entry.name,
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
			initialQuery={commandMenuInitialQuery}
			searchContent={searchContent}
			searchSemantic={searchSemantic}
			searchTags={searchTags}
		/>
	)
}
