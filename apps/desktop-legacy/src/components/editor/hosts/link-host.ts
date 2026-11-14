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
import { useShallow } from "zustand/shallow"
import { getDesktopRuntime, useDocumentState, useWorkspaceState } from "@/state"
import {
	selectActiveDocument,
	selectDocumentById,
} from "@/state/documents/selectors"
import type { DocumentsSnapshot } from "@/state/documents/types"

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
			getDesktopRuntime().documents.commands.openTab(
				path,
				options?.skipHistory,
				options?.force,
			),
	},
	noteCreation: {
		createNote: (directoryPath, options) =>
			getDesktopRuntime().workspace.commands.createNote(directoryPath, {
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
	const selectLinkDocument = (state: DocumentsSnapshot) =>
		typeof documentId === "number"
			? selectDocumentById(state, documentId)
			: selectActiveDocument(state)

	const useDesktopWorkspaceSnapshot: LinkWorkspacePort["useSnapshot"] = () => {
		const { workspacePath, entries } = useWorkspaceState(
			useShallow((state) => ({
				workspacePath: state.workspacePath,
				entries: state.entries,
			})),
		)
		const tab = useDocumentState(selectLinkDocument)
		return { workspacePath, tab, entries }
	}

	const getDesktopWorkspaceSnapshot: LinkWorkspacePort["getSnapshot"] = () => {
		const { workspace, documents } = getDesktopRuntime()
		const { workspacePath, entries } = workspace.getSnapshot()
		return {
			workspacePath,
			entries,
			tab: selectLinkDocument(documents.getSnapshot()),
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
			return getDesktopRuntime().indexing.commands.getIndexingConfig(
				workspacePath,
			)
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
