import { createState } from "../create-state"
import type { IndexingConfig } from "./indexing-models"
import type { ServiceScheduler } from "./scheduler"
import { createSerialQueue } from "./serial-queue"

export * from "./indexing-models"

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

export type IndexingSnapshot = {
	config: IndexingConfig | null
	isIndexing: boolean
	indexedDocCount: number
	isMetaLoading: boolean
}

const AUTO_INDEX_INTERVAL_MS = 30 * 60 * 1000
const META_POLL_INTERVAL_MS = 1_000

const initialSnapshot = (): IndexingSnapshot => ({
	config: null,
	isIndexing: false,
	indexedDocCount: 0,
	isMetaLoading: false,
})

const normalizeConfig = (
	provider: string | undefined,
	model: string | undefined,
): IndexingConfig | null => {
	const embeddingModel = model?.trim()
	return embeddingModel
		? { embeddingProvider: provider?.trim() || "ollama", embeddingModel }
		: null
}

type IndexingScope = {
	path: string
	configVersion: number
	configLoad: Promise<IndexingConfig | null> | null
	metaLoad: Promise<void> | null
	stopAuto: (() => void) | null
	stopProgress: (() => void) | null
	autoStarted: boolean
}

export const createIndexingService = ({
	createIndexingPort,
	scheduler,
}: {
	createIndexingPort: (path: string) => IndexingPort
	scheduler?: Pick<ServiceScheduler, "every">
}) => {
	const state = createState(initialSnapshot())
	const running = new Set<string>()
	const configWrites = createSerialQueue()
	let scope: IndexingScope | null = null

	const setWorkspace = (path: string | null) => {
		scope?.stopAuto?.()
		scope?.stopProgress?.()
		scope = path
			? {
					path,
					configVersion: 0,
					configLoad: null,
					metaLoad: null,
					stopAuto: null,
					stopProgress: null,
					autoStarted: false,
				}
			: null
		state.update({
			...initialSnapshot(),
			isIndexing: path ? running.has(path) : false,
		})
	}

	const readConfig = async (path: string) => {
		const config = await createIndexingPort(path).getIndexingConfig()
		return normalizeConfig(config?.embeddingProvider, config?.embeddingModel)
	}

	const getIndexingConfig = (path: string | null) => {
		if (!path) {
			return Promise.resolve(null)
		}
		const current = scope
		if (current?.path !== path) {
			return readConfig(path)
		}
		const { config } = state.getSnapshot()
		if (config) {
			return Promise.resolve(config)
		}
		if (!current.configLoad) {
			const version = current.configVersion
			current.configLoad = readConfig(path)
				.then((result) => {
					if (scope === current && current.configVersion === version) {
						state.update({ config: result })
					}
					return result
				})
				.finally(() => {
					current.configLoad = null
				})
		}
		return current.configLoad
	}

	const setIndexingConfig = (path: string, provider: string, model: string) => {
		return configWrites(async () => {
			await createIndexingPort(path).setIndexingConfig(provider, model)
			if (scope?.path === path) {
				scope.configVersion += 1
				state.update({ config: normalizeConfig(provider, model) })
			}
		})
	}

	const loadIndexingMeta = (path: string) => {
		const current = scope
		if (current?.path !== path) {
			return Promise.resolve()
		}
		if (current.metaLoad) {
			return current.metaLoad
		}

		current.metaLoad = Promise.resolve()
			.then(() => createIndexingPort(path).getIndexingMeta())
			.then(
				(meta) => meta.indexedDocCount ?? 0,
				() => 0,
			)
			.then((indexedDocCount) => {
				if (scope === current) {
					state.update({ indexedDocCount, isMetaLoading: false })
				}
			})
			.finally(() => {
				current.metaLoad = null
			})
		state.update({ isMetaLoading: true })
		return current.metaLoad
	}

	const runIndexing = async <Result>(
		path: string,
		run: (port: IndexingPort) => Promise<Result>,
	): Promise<Result> => {
		if (running.has(path)) {
			throw new Error("Indexing is already running for this workspace")
		}
		running.add(path)
		const current = scope
		if (current?.path === path) {
			state.update({ isIndexing: true })
			current.stopProgress =
				scheduler?.every(META_POLL_INTERVAL_MS, () => {
					if (scope === current) {
						void loadIndexingMeta(path)
					}
				}) ?? null
		}
		try {
			return await run(createIndexingPort(path))
		} finally {
			running.delete(path)
			if (current?.path === path) {
				current.stopProgress?.()
				current.stopProgress = null
			}
			if (scope?.path === path) {
				state.update({ isIndexing: false })
				// Wait for any poll in flight, then read the final count.
				await scope.metaLoad
				await loadIndexingMeta(path)
			}
		}
	}

	const indexVaultDocuments = (path: string, forceReindex: boolean) =>
		runIndexing(path, (port) => port.indexVaultDocuments(forceReindex))

	const refreshWorkspaceEmbeddings = (path: string) =>
		runIndexing(path, (port) => port.refreshWorkspaceEmbeddings())

	const startAutoIndexing = (path: string) => {
		const current = scope
		if (current?.path !== path || current.autoStarted) {
			return
		}
		current.autoStarted = true
		void getIndexingConfig(path).catch((error) => {
			console.error("Failed to load indexing config:", error)
		})
		void loadIndexingMeta(path)

		if (!running.has(path)) {
			void indexVaultDocuments(path, false).catch((error) => {
				console.error("Initial auto-indexing failed:", error)
			})
		}
		current.stopAuto =
			scheduler?.every(AUTO_INDEX_INTERVAL_MS, () => {
				if (scope === current && !running.has(path)) {
					void refreshWorkspaceEmbeddings(path).catch((error) => {
						console.error("Auto-indexing failed:", error)
					})
				}
			}) ?? null
	}

	return {
		getSnapshot: state.getSnapshot,
		subscribe: state.subscribe,
		commands: {
			setWorkspace,
			startAutoIndexing,
			resetIndexingState: () => setWorkspace(null),
			getIndexingConfig,
			setIndexingConfig,
			indexVaultDocuments,
			refreshWorkspaceEmbeddings,
			loadIndexingMeta,
		},
	}
}
