import type { OllamaModels } from "@mdit/store/core"
import { invoke } from "@tauri-apps/api/core"

type OllamaModelsCommandResult = {
	completionModels?: string[]
	embeddingModels?: string[]
}

export async function fetchOllamaModels(): Promise<OllamaModels> {
	const data = await invoke<OllamaModelsCommandResult>(
		"list_ollama_models_command",
	)
	return {
		completionModels: data.completionModels ?? [],
		embeddingModels: data.embeddingModels ?? [],
	}
}
