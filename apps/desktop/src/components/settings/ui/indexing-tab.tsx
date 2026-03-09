import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@mdit/ui/components/field"
import { Loader2Icon, RefreshCcwIcon } from "lucide-react"
import { useMemo } from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"
import { calculateIndexingProgress } from "@/store/indexing/helpers/indexing-utils"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"
import { useIndexingMetaPolling } from "../hooks/use-indexing-meta-polling"
import { useIndexingModelChange } from "../hooks/use-indexing-model-change"
import { useOllamaModelRefresh } from "../hooks/use-ollama-model-refresh"
import { EmbeddingModelChangeDialog } from "./embedding-model-change-dialog"
import { INDEXING_MODEL_CONTROL_STATE } from "./indexing-ui-state"
import { SettingsButton } from "./settings-button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectValue,
	SettingsSelectTrigger,
} from "./settings-select"

export function IndexingTab() {
	const {
		workspacePath,
		entries,
		ollamaEmbeddingModels,
		fetchOllamaModels,
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

	const { isRefreshingModels, refreshOllamaModels } =
		useOllamaModelRefresh(fetchOllamaModels)
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
							<div className="flex items-center gap-2">
								<Select
									value={selectedEmbeddingModel ?? undefined}
									onValueChange={requestModelChange}
									disabled={modelControlState.disabled}
								>
									<SettingsSelectTrigger className="w-[240px]">
										<SelectValue placeholder={modelControlState.placeholder} />
									</SettingsSelectTrigger>
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
											<div className="px-3 py-2 text-xs text-muted-foreground">
												No models available
											</div>
										)}
									</SelectContent>
								</Select>
								<SettingsButton
									variant="outline"
									disabled={isRefreshingModels}
									onClick={() => void refreshOllamaModels()}
								>
									{isRefreshingModels ? (
										<Loader2Icon className="size-4 animate-spin" />
									) : (
										<RefreshCcwIcon className="size-4" />
									)}
									Refresh
								</SettingsButton>
							</div>
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
								<SettingsButton
									onClick={() => runIndex(false)}
									variant="outline"
									disabled={isIndexButtonDisabled}
								>
									{isIndexing && (
										<Loader2Icon className="size-4 animate-spin" />
									)}
									{isIndexing ? "Indexing..." : "Manually Index"}
								</SettingsButton>
								<SettingsButton
									onClick={() => runIndex(true)}
									variant="destructive"
									disabled={isIndexing}
								>
									<RefreshCcwIcon className="size-4" />
									Force Rebuild
								</SettingsButton>
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
