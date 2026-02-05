import { Loader2Icon, RefreshCcwIcon } from "lucide-react"
import { useCallback, useEffect, useMemo } from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"
import { calculateIndexingProgress } from "@/store/indexing/helpers/indexing-utils"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"
import { Button } from "@/ui/button"
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/ui/field"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select"
import { EmbeddingModelChangeDialog } from "./embedding-model-change-dialog"

export function IndexingTab() {
	const {
		workspacePath,
		entries,
		ollamaModels,
		fetchOllamaModels,
		indexWorkspace,
		indexingState,
		configs,
		indexedDocCount,
		isMetaLoading,
		showModelChangeDialog,
		loadIndexingMeta,
		startIndexingMetaPolling,
		stopIndexingMetaPolling,
		handleModelChangeRequest,
		confirmModelChange,
		cancelModelChange,
	} = useStore(
		useShallow((state) => ({
			workspacePath: state.workspacePath,
			entries: state.entries,
			ollamaModels: state.ollamaModels,
			fetchOllamaModels: state.fetchOllamaModels,
			indexWorkspace: state.indexWorkspace,
			indexingState: state.indexingState,
			configs: state.configs,
			indexedDocCount: state.indexedDocCount,
			isMetaLoading: state.isMetaLoading,
			showModelChangeDialog: state.showModelChangeDialog,
			loadIndexingMeta: state.loadIndexingMeta,
			startIndexingMetaPolling: state.startIndexingMetaPolling,
			stopIndexingMetaPolling: state.stopIndexingMetaPolling,
			handleModelChangeRequest: state.handleModelChangeRequest,
			confirmModelChange: state.confirmModelChange,
			cancelModelChange: state.cancelModelChange,
		})),
	)

	const isIndexing = workspacePath
		? (indexingState[workspacePath] ?? false)
		: false

	// Get current config from store
	const currentConfig = useMemo(() => {
		if (!workspacePath) {
			return null
		}
		return configs[workspacePath] ?? null
	}, [workspacePath, configs])

	const embeddingProvider = currentConfig?.embeddingProvider ?? ""
	const embeddingModel = currentConfig?.embeddingModel ?? ""

	const totalFiles = useMemo(() => countMarkdownFiles(entries), [entries])

	const indexingProgress = useMemo(
		() => calculateIndexingProgress(indexedDocCount, totalFiles),
		[indexedDocCount, totalFiles],
	)

	// Fetch models on mount
	useEffect(() => {
		fetchOllamaModels()
	}, [fetchOllamaModels])

	// Load config when workspace changes
	useEffect(() => {
		if (!workspacePath) {
			return
		}

		const { getIndexingConfig } = useStore.getState()
		getIndexingConfig(workspacePath)
	}, [workspacePath])

	// Load indexing meta and start polling when workspace changes
	useEffect(() => {
		if (!workspacePath) {
			return
		}

		loadIndexingMeta(workspacePath)
	}, [workspacePath, loadIndexingMeta])

	// Start/stop polling based on indexing state
	useEffect(() => {
		if (!workspacePath || !isIndexing) {
			stopIndexingMetaPolling()
			return
		}

		startIndexingMetaPolling(workspacePath)
		return () => stopIndexingMetaPolling()
	}, [
		workspacePath,
		isIndexing,
		startIndexingMetaPolling,
		stopIndexingMetaPolling,
	])

	const handleEmbeddingModelChange = useCallback(
		async (value: string) => {
			if (!workspacePath) {
				return
			}

			await handleModelChangeRequest(
				value,
				workspacePath,
				currentConfig,
				indexedDocCount,
			)
		},
		[workspacePath, currentConfig, indexedDocCount, handleModelChangeRequest],
	)

	const handleConfirmModelChange = useCallback(async () => {
		if (!workspacePath) {
			return
		}

		await confirmModelChange(workspacePath, true)
	}, [workspacePath, confirmModelChange])

	const handleDialogCancel = useCallback(() => {
		cancelModelChange()
	}, [cancelModelChange])

	const isEmbeddingModelConfigured = embeddingModel !== ""
	const isEmbeddingModelAvailable =
		isEmbeddingModelConfigured &&
		embeddingProvider !== "" &&
		ollamaModels.includes(embeddingModel)
	const selectedEmbeddingModel =
		isEmbeddingModelAvailable && embeddingProvider
			? `${embeddingProvider}|${embeddingModel}`
			: null
	const isIndexButtonDisabled =
		isIndexing ||
		isMetaLoading ||
		(isEmbeddingModelConfigured && !isEmbeddingModelAvailable)

	const runIndex = async (forceReindex: boolean) => {
		if (!workspacePath) {
			return
		}

		if (isEmbeddingModelConfigured && !isEmbeddingModelAvailable) {
			return
		}

		try {
			await indexWorkspace(
				workspacePath,
				embeddingProvider,
				embeddingModel,
				forceReindex,
			)
			await loadIndexingMeta(workspacePath)
		} catch (error) {
			console.error("Failed to index workspace:", error)
		}
	}

	const progressLabel = `${indexedDocCount}/${totalFiles || 0} files indexed`

	if (!workspacePath) {
		return null
	}

	return (
		<>
			<EmbeddingModelChangeDialog
				open={showModelChangeDialog}
				onOpenChange={(open) => {
					if (open) {
						// Dialog is controlled by store, shouldn't open manually
					} else {
						handleDialogCancel()
					}
				}}
				onConfirm={handleConfirmModelChange}
			/>
			<div className="flex-1 overflow-y-auto p-12">
				<FieldSet>
					<FieldLegend>Indexing</FieldLegend>
					<FieldDescription>
						Configure embedding model and manage workspace indexing
					</FieldDescription>
					<FieldGroup>
						<Field orientation="horizontal">
							<FieldContent>
								<FieldLabel>Embedding Model</FieldLabel>
								<FieldDescription>
									Select the embedding model to use for indexing
								</FieldDescription>
							</FieldContent>
							<Select
								value={selectedEmbeddingModel ?? undefined}
								onValueChange={handleEmbeddingModelChange}
							>
								<SelectTrigger size="sm">
									<SelectValue placeholder="Select a model" />
								</SelectTrigger>
								<SelectContent align="end">
									{ollamaModels.length > 0 ? (
										ollamaModels.map((model) => {
											return (
												<SelectItem key={model} value={`ollama|${model}`}>
													{model}
												</SelectItem>
											)
										})
									) : (
										<div className="px-3 py-2 text-xs text-muted-foreground">
											No models available
										</div>
									)}
								</SelectContent>
							</Select>
						</Field>

						<Field>
							<FieldContent>
								<FieldLabel>Indexing Progress</FieldLabel>
								<FieldDescription>
									Current indexing progress for the workspace
								</FieldDescription>
							</FieldContent>
							<div className="w-full">
								<div className="flex items-center justify-between mb-2">
									<span className="text-sm text-muted-foreground">
										{indexingProgress}%
									</span>
									<span className="text-xs text-muted-foreground">
										{progressLabel}
									</span>
								</div>
								<div className="w-full h-2 bg-muted rounded-full overflow-hidden">
									<div
										className="h-full bg-primary transition-all duration-300"
										style={{ width: `${indexingProgress}%` }}
									/>
								</div>
								<p className="mt-2 text-xs text-muted-foreground">
									Progress is estimated using the visible workspace files;
									actual indexed content may differ slightly.
								</p>
							</div>
							<div className="flex flex-wrap items-center justify-end gap-2 mt-4">
								<Button
									onClick={() => runIndex(false)}
									variant="outline"
									size="sm"
									disabled={isIndexButtonDisabled}
								>
									{isIndexing && (
										<Loader2Icon className="size-4 animate-spin" />
									)}
									{isIndexing ? "Indexing..." : "Manually Index"}
								</Button>
								<Button
									onClick={() => runIndex(true)}
									variant="destructive"
									size="sm"
									disabled={isIndexing}
								>
									<RefreshCcwIcon className="size-4" />
									Force Rebuild
								</Button>
							</div>
						</Field>
					</FieldGroup>
				</FieldSet>
			</div>
		</>
	)
}

const countMarkdownFiles = (entries: WorkspaceEntry[]): number => {
	return entries.reduce((total, entry) => {
		if (entry.isDirectory) {
			return total + countMarkdownFiles(entry.children ?? [])
		}

		return total + (isMarkdown(entry.name) ? 1 : 0)
	}, 0)
}

const isMarkdown = (name: string) => name.toLowerCase().endsWith(".md")
