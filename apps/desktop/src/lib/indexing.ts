import type {
	IndexingConfig,
	IndexingMeta,
	IndexingPort,
	WorkspaceIndexSummary,
} from "@mdit/store/core"
import { invoke } from "@tauri-apps/api/core"

export const createTauriIndexingPort = (
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
