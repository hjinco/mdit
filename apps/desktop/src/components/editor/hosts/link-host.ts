import type { LinkHostDeps, ResolveWikiLinkResult } from "@mdit/editor/link"
import { stripFileExtensionForDisplay } from "@mdit/editor/link"
import { invoke } from "@tauri-apps/api/core"
import { openUrl } from "@tauri-apps/plugin-opener"
import { resolve } from "pathe"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"

type RelatedNoteEntry = {
	relPath: string
	fileName: string
}

type DesktopLinkHostRuntimeDeps = {
	useWorkspaceState?: LinkHostDeps["useWorkspaceState"]
	getWorkspaceState?: LinkHostDeps["getWorkspaceState"]
	openExternalLink: (href: string) => Promise<void> | void
	openTab: LinkHostDeps["openTab"]
	createNote: LinkHostDeps["createNote"]
	resolveWikiLink: LinkHostDeps["resolveWikiLink"]
	getIndexingConfig?: NonNullable<LinkHostDeps["getIndexingConfig"]>
	getRelatedNotes?: NonNullable<LinkHostDeps["getRelatedNotes"]>
}

const useDesktopWorkspaceState: LinkHostDeps["useWorkspaceState"] = () =>
	useStore(
		useShallow((state) => ({
			workspacePath: state.workspacePath,
			tab: state.tab,
			entries: state.entries,
		})),
	)

const getDesktopWorkspaceState: LinkHostDeps["getWorkspaceState"] = () => {
	const state = useStore.getState()
	return {
		workspacePath: state.workspacePath,
		tab: state.tab,
		entries: state.entries,
	}
}

const defaultRuntimeDeps: DesktopLinkHostRuntimeDeps = {
	openExternalLink: openUrl,
	openTab: (path) => useStore.getState().openTab(path),
	createNote: (directoryPath, options) =>
		useStore.getState().createNote(directoryPath, options),
	resolveWikiLink: ({ workspacePath, currentNotePath, rawTarget }) =>
		invoke<ResolveWikiLinkResult>("resolve_wiki_link_command", {
			workspacePath,
			currentNotePath,
			rawTarget,
		}),
}

export const createDesktopLinkHost = (
	runtimeDeps: DesktopLinkHostRuntimeDeps = defaultRuntimeDeps,
): LinkHostDeps => {
	const getIndexingConfig: NonNullable<
		LinkHostDeps["getIndexingConfig"]
	> = async (workspacePath) => {
		if (runtimeDeps.getIndexingConfig) {
			return runtimeDeps.getIndexingConfig(workspacePath)
		}

		if (!workspacePath) {
			return null
		}

		try {
			return useStore.getState().getIndexingConfig(workspacePath)
		} catch (error) {
			console.error("Failed to get indexing config from store:", error)
			return null
		}
	}

	return {
		useWorkspaceState:
			runtimeDeps.useWorkspaceState ?? useDesktopWorkspaceState,
		getWorkspaceState:
			runtimeDeps.getWorkspaceState ?? getDesktopWorkspaceState,
		openExternalLink: runtimeDeps.openExternalLink,
		openTab: runtimeDeps.openTab,
		createNote: runtimeDeps.createNote,
		resolveWikiLink: runtimeDeps.resolveWikiLink,
		getIndexingConfig,
		getRelatedNotes: async ({ workspacePath, currentTabPath, limit }) => {
			if (runtimeDeps.getRelatedNotes) {
				return runtimeDeps.getRelatedNotes({
					workspacePath,
					currentTabPath,
					limit,
				})
			}

			if (!workspacePath || !currentTabPath) {
				return []
			}

			const entries = await invoke<RelatedNoteEntry[]>(
				"get_related_notes_command",
				{
					workspacePath,
					filePath: currentTabPath,
					limit,
				},
			)

			return entries.map((entry) => {
				const relativePath = entry.relPath
				return {
					absolutePath: resolve(workspacePath, relativePath),
					displayName: stripFileExtensionForDisplay(entry.fileName),
					relativePath,
					relativePathLower: relativePath.toLowerCase(),
				}
			})
		},
	}
}
