import type { invoke as tauriInvoke } from "@tauri-apps/api/core"
import type {
	IndexingConfig,
	IndexingMeta,
	WorkspaceIndexSummary,
} from "./indexing-types"

export type InvokeFunction = typeof tauriInvoke

export type IndexingPort = {
	getIndexingMeta: () => Promise<IndexingMeta>
	getIndexingConfig: () => Promise<IndexingConfig | null>
	setIndexingConfig: (
		embeddingProvider: string,
		embeddingModel: string,
	) => Promise<void>
	indexWorkspace: (forceReindex: boolean) => Promise<WorkspaceIndexSummary>
	indexNote: (
		notePath: string,
		options?: { includeEmbeddings?: boolean },
	) => Promise<WorkspaceIndexSummary>
}

export const createTauriIndexingPort = (
	invoke: InvokeFunction,
	workspacePath: string,
): IndexingPort => ({
	getIndexingMeta: () =>
		invoke<IndexingMeta>("get_indexing_meta_command", {
			workspacePath,
		}),
	getIndexingConfig: () =>
		invoke<IndexingConfig | null>("get_vault_embedding_config_command", {
			workspacePath,
		}),
	setIndexingConfig: (embeddingProvider: string, embeddingModel: string) =>
		invoke<void>("set_vault_embedding_config_command", {
			workspacePath,
			embeddingProvider,
			embeddingModel,
		}),
	indexWorkspace: (forceReindex: boolean) =>
		invoke<WorkspaceIndexSummary>("index_workspace_command", {
			workspacePath,
			forceReindex,
		}),
	indexNote: (notePath: string, options?: { includeEmbeddings?: boolean }) =>
		invoke<WorkspaceIndexSummary>("index_note_command", {
			workspacePath,
			notePath,
			includeEmbeddings: options?.includeEmbeddings ?? true,
		}),
})
