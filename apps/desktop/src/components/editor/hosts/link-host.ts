import type {
	LinkServices,
	LinkSuggestionPort,
	LinkWorkspacePort,
	ResolveWikiLinkResult,
} from "@mdit/editor/link"
import { stripFileExtensionForDisplay } from "@mdit/editor/link"
import { invoke } from "@tauri-apps/api/core"
import { openUrl } from "@tauri-apps/plugin-opener"
import { resolve } from "pathe"
import { useMemo } from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"

type RelatedNoteEntry = {
	relPath: string
	fileName: string
}

type DesktopLinkRuntimeDeps = {
	workspace?: Partial<LinkWorkspacePort>
	navigation?: Partial<LinkServices["navigation"]>
	noteCreation?: Partial<NonNullable<LinkServices["noteCreation"]>>
	resolver?: Partial<NonNullable<LinkServices["resolver"]>>
	suggestions?: Partial<LinkSuggestionPort>
}

const defaultRuntimeDeps: DesktopLinkRuntimeDeps = {
	navigation: {
		openExternal: openUrl,
		openPath: (path, options) =>
			useStore.getState().openTab(path, options?.skipHistory, options?.force),
	},
	noteCreation: {
		createNote: (directoryPath, options) =>
			useStore.getState().createNote(directoryPath, {
				initialContent: options?.initialContent,
				initialName: options?.initialName,
				openTab: options?.openPath,
			}),
	},
	resolver: {
		resolveWikiLink: ({ workspacePath, currentNotePath, rawTarget }) =>
			invoke<ResolveWikiLinkResult>("resolve_wiki_link_command", {
				workspacePath,
				currentNotePath,
				rawTarget,
			}),
	},
}

export const createDesktopLinkServices = (
	documentId?: number,
	runtimeDeps: DesktopLinkRuntimeDeps = defaultRuntimeDeps,
): LinkServices => {
	const useDesktopWorkspaceSnapshot: LinkWorkspacePort["useSnapshot"] = () => {
		const { workspacePath, entries, activeTabId, tabs, openDocuments } =
			useStore(
				useShallow((state) => ({
					workspacePath: state.workspacePath,
					entries: state.entries,
					activeTabId: state.activeTabId,
					tabs: state.tabs,
					openDocuments: state.openDocuments,
				})),
			)
		const tab = useMemo(() => {
			if (typeof documentId === "number") {
				return (
					openDocuments.find((document) => document.id === documentId) ?? null
				)
			}

			const activeTab = tabs.find((tab) => tab.id === activeTabId)
			if (!activeTab) {
				return null
			}

			return (
				openDocuments.find(
					(document) => document.id === activeTab.documentId,
				) ?? null
			)
		}, [activeTabId, openDocuments, tabs])

		return {
			workspacePath,
			tab,
			entries,
		}
	}

	const getDesktopWorkspaceSnapshot: LinkWorkspacePort["getSnapshot"] = () => {
		const state = useStore.getState()
		const activeTab =
			typeof documentId === "number"
				? null
				: state.tabs.find((tab) => tab.id === state.activeTabId)
		return {
			workspacePath: state.workspacePath,
			tab:
				typeof documentId === "number"
					? state.getDocumentById(documentId)
					: activeTab
						? state.getDocumentById(activeTab.documentId)
						: null,
			entries: state.entries,
		}
	}

	const getIndexingConfig: LinkSuggestionPort["getIndexingConfig"] = async (
		workspacePath,
	) => {
		if (runtimeDeps.suggestions?.getIndexingConfig) {
			return runtimeDeps.suggestions.getIndexingConfig(workspacePath)
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
		navigation: {
			openExternal:
				runtimeDeps.navigation?.openExternal ??
				defaultRuntimeDeps.navigation!.openExternal!,
			openPath:
				runtimeDeps.navigation?.openPath ??
				defaultRuntimeDeps.navigation!.openPath!,
		},
		noteCreation: {
			createNote:
				runtimeDeps.noteCreation?.createNote ??
				defaultRuntimeDeps.noteCreation!.createNote!,
		},
		resolver: {
			resolveWikiLink:
				runtimeDeps.resolver?.resolveWikiLink ??
				defaultRuntimeDeps.resolver!.resolveWikiLink!,
		},
		suggestions: {
			getIndexingConfig,
			getRelatedNotes: async ({ workspacePath, currentTabPath, limit }) => {
				if (runtimeDeps.suggestions?.getRelatedNotes) {
					return runtimeDeps.suggestions.getRelatedNotes({
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
		},
		workspace: {
			useSnapshot:
				runtimeDeps.workspace?.useSnapshot ?? useDesktopWorkspaceSnapshot,
			getSnapshot:
				runtimeDeps.workspace?.getSnapshot ?? getDesktopWorkspaceSnapshot,
		},
	}
}

export const desktopLinkServices = createDesktopLinkServices()
