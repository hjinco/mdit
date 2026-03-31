import { Button } from "@mdit/ui/components/button"
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@mdit/ui/components/field"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@mdit/ui/components/select"
import { Loader2Icon, RefreshCcwIcon } from "lucide-react"
import { useMemo } from "react"
import { useShallow } from "zustand/shallow"
import type { WorkspaceEntry } from "@/store"
import { calculateIndexingProgress, useStore } from "@/store"
import { useIndexingMetaPolling } from "../hooks/use-indexing-meta-polling"
import { useIndexingModelChange } from "../hooks/use-indexing-model-change"
import { EmbeddingModelChangeDialog } from "./embedding-model-change-dialog"
import { INDEXING_MODEL_CONTROL_STATE } from "./indexing-ui-state"

export function IndexingTab() {
	const {
		workspacePath,
		entries,
		ollamaEmbeddingModels,
		indexVaultDocuments,
		isIndexing,
		config,
		indexedDocCount,
		isMetaLoading,
	} = useStore(
		useShallow((state) => ({
			workspacePath: state.workspacePath,
			entries: state.entries,
			ollamaEmbeddingModels: state.ollamaEmbeddingModels,
			fetchOllamaModels: state.fetchOllamaModels,
			indexVaultDocuments: state.indexVaultDocuments,
			isIndexing: state.isIndexing,
			config: state.config,
			indexedDocCount: state.indexedDocCount,
			isMetaLoading: state.isMetaLoading,
		})),
	)

	const currentConfig = config
	useIndexingMetaPolling(workspacePath, isIndexing)
	const {
		isDialogOpen,
		requestModelChange,
		confirmModelChange,
		cancelModelChange,
	} = useIndexingModelChange(workspacePath, currentConfig, indexedDocCount)

	const embeddingProvider = currentConfig?.embeddingProvider ?? ""
	const embeddingModel = currentConfig?.embeddingModel ?? ""

	const totalFiles = useMemo(() => countMarkdownFiles(entries), [entries])

	const indexingProgress = useMemo(
		() => calculateIndexingProgress(indexedDocCount, totalFiles),
		[indexedDocCount, totalFiles],
	)

	const isEmbeddingModelConfigured = embeddingModel !== ""
	const isEmbeddingModelAvailable =
		isEmbeddingModelConfigured &&
		embeddingProvider !== "" &&
		ollamaEmbeddingModels.includes(embeddingModel)
	const selectedEmbeddingModel =
		isEmbeddingModelAvailable && embeddingProvider
			? `${embeddingProvider}|${embeddingModel}`
			: null
	const isIndexButtonDisabled =
		isIndexing ||
		isMetaLoading ||
		(isEmbeddingModelConfigured && !isEmbeddingModelAvailable)
	const modelControlState = INDEXING_MODEL_CONTROL_STATE

	const runIndex = async (forceReindex: boolean) => {
		if (!workspacePath) {
			return
		}

		try {
			await indexVaultDocuments(workspacePath, forceReindex)
			await useStore.getState().loadIndexingMeta(workspacePath)
		} catch (error) {
			console.error("Failed to index vault documents:", error)
		}
	}

	const progressLabel = `${indexedDocCount}/${totalFiles || 0} files indexed`

	if (!workspacePath) {
		return null
	}

	return (
		<>
			<EmbeddingModelChangeDialog
				open={isDialogOpen}
				onCancel={cancelModelChange}
				onConfirm={confirmModelChange}
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
									{modelControlState.description}
								</FieldDescription>
							</FieldContent>
							<Select
								value={selectedEmbeddingModel ?? undefined}
								onValueChange={requestModelChange}
								disabled={modelControlState.disabled}
							>
								<SelectTrigger className="w-[200px]">
									<SelectValue placeholder={modelControlState.placeholder} />
								</SelectTrigger>
								<SelectContent align="end">
									{ollamaEmbeddingModels.length > 0 ? (
										ollamaEmbeddingModels.map((model) => {
											return (
												<SelectItem key={model} value={`ollama|${model}`}>
													{model}
												</SelectItem>
											)
										})
									) : (
										<div className="px-1 py-0.5 text-sm text-muted-foreground">
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
