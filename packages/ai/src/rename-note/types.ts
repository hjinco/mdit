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

export type RenameNoteWithAIResult = {
	finalFileName: string
	suggestedBaseName: string
	dirPath: string
}
