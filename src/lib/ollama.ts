export type OllamaTagsResponse = {
	models: Array<{
		name: string
		modified_at: string
		size: number
		digest: string
		details?: {
			format: string
			family: string
			families: string[]
			parameter_size: string
			quantization_level: string
		}
	}>
}

const OLLAMA_API_URL = "http://localhost:11434/api/tags"

export async function fetchOllamaModels(): Promise<string[]> {
	try {
		const response = await fetch(OLLAMA_API_URL)
		if (!response.ok) {
			// Silently fail - treat as Ollama not installed
			return []
		}
		const data = (await response.json()) as OllamaTagsResponse
		return data.models.map((model) => model.name)
	} catch (error) {
		console.error("Failed to fetch Ollama models:", error)
		return []
	}
}
