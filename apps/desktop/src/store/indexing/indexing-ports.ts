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
	indexVaultDocuments: (forceReindex: boolean) => Promise<WorkspaceIndexSummary>
	refreshWorkspaceEmbeddings: () => Promise<WorkspaceIndexSummary>
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
	indexVaultDocuments: (forceReindex: boolean) =>
		invoke<WorkspaceIndexSummary>("index_vault_documents_command", {
			workspacePath,
			forceReindex,
		}),
	refreshWorkspaceEmbeddings: () =>
		invoke<WorkspaceIndexSummary>("refresh_workspace_embeddings_command", {
			workspacePath,
		}),
})
