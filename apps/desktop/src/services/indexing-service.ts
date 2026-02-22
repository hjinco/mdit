import type { invoke as tauriInvoke } from "@tauri-apps/api/core"
import type { IndexingMeta } from "@/store/indexing/helpers/indexing-utils"
import type { WorkspaceIndexSummary } from "@/store/indexing/indexing-slice"

export type InvokeFunction = typeof tauriInvoke

export class IndexingService {
	private readonly invoke: InvokeFunction
	private readonly workspacePath: string

	constructor(invoke: InvokeFunction, workspacePath: string) {
		this.invoke = invoke
		this.workspacePath = workspacePath
	}

	async getIndexingMeta(): Promise<IndexingMeta> {
		const meta = await this.invoke<IndexingMeta>("get_indexing_meta_command", {
			workspacePath: this.workspacePath,
		})
		return meta
	}

	async getIndexingConfig(): Promise<{
		embeddingProvider: string
		embeddingModel: string
	} | null> {
		const config = await this.invoke<{
			embeddingProvider: string
			embeddingModel: string
		} | null>("get_vault_embedding_config_command", {
			workspacePath: this.workspacePath,
		})
		return config
	}

	async setIndexingConfig(
		embeddingProvider: string,
		embeddingModel: string,
	): Promise<void> {
		await this.invoke<void>("set_vault_embedding_config_command", {
			workspacePath: this.workspacePath,
			embeddingProvider,
			embeddingModel,
		})
	}

	async indexWorkspace(forceReindex: boolean): Promise<WorkspaceIndexSummary> {
		const result = await this.invoke<WorkspaceIndexSummary>(
			"index_workspace_command",
			{
				workspacePath: this.workspacePath,
				forceReindex,
			},
		)
		return result
	}

	async indexNote(
		notePath: string,
		options?: { includeEmbeddings?: boolean },
	): Promise<WorkspaceIndexSummary> {
		const result = await this.invoke<WorkspaceIndexSummary>(
			"index_note_command",
			{
				workspacePath: this.workspacePath,
				notePath,
				includeEmbeddings: options?.includeEmbeddings ?? true,
			},
		)
		return result
	}
}
