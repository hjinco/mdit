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
	getIndexingMeta: async () => {
		const meta = await invoke<IndexingMeta>("get_indexing_meta_command", {
			workspacePath,
		})
		return meta
	},
	getIndexingConfig: async () => {
		const config = await invoke<IndexingConfig | null>(
			"get_vault_embedding_config_command",
			{
				workspacePath,
			},
		)
		return config
	},
	setIndexingConfig: async (
		embeddingProvider: string,
		embeddingModel: string,
	) => {
		await invoke<void>("set_vault_embedding_config_command", {
			workspacePath,
			embeddingProvider,
			embeddingModel,
		})
	},
	indexWorkspace: async (forceReindex: boolean) => {
		const result = await invoke<WorkspaceIndexSummary>(
			"index_workspace_command",
			{
				workspacePath,
				forceReindex,
			},
		)
		return result
	},
	indexNote: async (
		notePath: string,
		options?: { includeEmbeddings?: boolean },
	) => {
		const result = await invoke<WorkspaceIndexSummary>("index_note_command", {
			workspacePath,
			notePath,
			includeEmbeddings: options?.includeEmbeddings ?? true,
		})
		return result
	},
})
