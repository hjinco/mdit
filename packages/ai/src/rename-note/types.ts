import type { AIChatConfig, AICodexModelOptions } from "../shared/chat-config"

export type RenameNoteWithAIChatConfig = AIChatConfig

export type RenameNoteWithAIEntry = {
	path: string
	name: string
	isDirectory: boolean
}

export type RenameNoteWithAIDirEntry = {
	name?: string | null
}

export type RenameNoteWithAIFileSystemPorts = {
	readTextFile: (path: string) => Promise<string>
	readDir: (path: string) => Promise<RenameNoteWithAIDirEntry[]>
	exists: (path: string) => Promise<boolean>
}

export type RenameNoteWithAICodexOptions = AICodexModelOptions

export type RenameNoteWithAIOperation = {
	path: string
	status: "renamed" | "unchanged" | "failed"
	suggestedBaseName?: string
	finalFileName?: string
	reason?: string
}

export type RenameNoteWithAIBatchResult = {
	renamedCount: number
	unchangedCount: number
	failedCount: number
	operations: RenameNoteWithAIOperation[]
	dirPath: string
}
