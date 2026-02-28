export type IndexingConfig = {
	embeddingProvider: string
	embeddingModel: string
}

export type WorkspaceIndexSummary = {
	files_discovered: number
	files_processed: number
	docs_inserted: number
	docs_deleted: number
	segments_created: number
	segments_updated: number
	embeddings_written: number
	links_written: number
	links_deleted: number
	skipped_files: string[]
}

export type IndexingMeta = {
	indexedDocCount: number
}
