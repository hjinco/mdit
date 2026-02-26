import type { AIChatConfig, AICodexModelOptions } from "../shared/chat-config"

export type MoveNoteWithAIChatConfig = AIChatConfig

export type MoveNoteWithAIEntry = {
	path: string
	name: string
	isDirectory: boolean
}

export type MoveNoteWithAIFileSystemPorts = {
	readTextFile: (path: string) => Promise<string>
	moveEntry: (
		sourcePath: string,
		destinationPath: string,
		options?: {
			onConflict?: "fail" | "auto-rename"
			allowLockedSourcePath?: boolean
			onMoved?: (newPath: string) => void
		},
	) => Promise<boolean>
}

export type MoveNoteWithAICodexOptions = AICodexModelOptions

export type MoveNoteWithAIOperation = {
	path: string
	status: "moved" | "unchanged" | "failed"
	destinationDirPath?: string
	newPath?: string
	reason?: string
}

export type MoveNoteWithAIBatchResult = {
	movedCount: number
	unchangedCount: number
	failedCount: number
	operations: MoveNoteWithAIOperation[]
}
