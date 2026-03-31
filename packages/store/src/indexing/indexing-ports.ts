import type {
	IndexingConfig,
	IndexingMeta,
	WorkspaceIndexSummary,
} from "./indexing-types"

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
