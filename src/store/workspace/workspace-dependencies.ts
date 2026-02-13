import type { DirEntry, FileInfo } from "@tauri-apps/plugin-fs"
import type { WorkspaceSettingsRepository } from "@/repositories/workspace-settings-repository"

export type OpenDialog = (options: {
	multiple?: boolean
	directory?: boolean
	title?: string
}) => Promise<string | null>

export type ApplyWorkspaceMigrations = (workspacePath: string) => Promise<void>

export type FileSystemRepositoryLike = {
	exists: (path: string) => Promise<boolean>
	isExistingDirectory: (path: string) => Promise<boolean>
	mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>
	readDir: (path: string) => Promise<DirEntry[]>
	readTextFile: (path: string) => Promise<string>
	rename: (sourcePath: string, destinationPath: string) => Promise<void>
	writeTextFile: (path: string, contents: string) => Promise<void>
	moveToTrash: (path: string) => Promise<void>
	moveManyToTrash: (paths: string[]) => Promise<void>
	copy: (sourcePath: string, destinationPath: string) => Promise<void>
	stat: (path: string) => Promise<FileInfo>
}

export type WorkspaceSettingsRepositoryLike = Pick<
	WorkspaceSettingsRepository,
	| "loadSettings"
	| "getPinnedDirectoriesFromSettings"
	| "getExpandedDirectoriesFromSettings"
	| "persistPinnedDirectories"
	| "persistExpandedDirectories"
>

export type WorkspaceHistoryRepositoryLike = {
	readWorkspaceHistory: () => string[]
	writeWorkspaceHistory: (paths: string[]) => void
	removeFromWorkspaceHistory: (path: string) => string[]
}

export type FrontmatterUtils = {
	updateFileFrontmatter: (
		path: string,
		updates: Record<string, unknown>,
	) => Promise<unknown>
	renameFileFrontmatterProperty: (
		path: string,
		oldKey: string,
		newKey: string,
	) => Promise<unknown>
	removeFileFrontmatterProperty: (path: string, key: string) => Promise<unknown>
}

export type ToastLike = {
	success: (...args: any[]) => any
	error?: (...args: any[]) => any
}

export type GenerateText = (args: any) => Promise<{ text: string }>

export type AiRenameHelpers = {
	AI_RENAME_SYSTEM_PROMPT: string
	buildRenamePrompt: (args: {
		currentName: string
		otherNoteNames: string[]
		content: string
		dirPath: string
	}) => string
	collectSiblingNoteNames: (dirEntries: any[], entryName: string) => string[]
	createModelFromConfig: (config: any) => any
	extractAndSanitizeName: (raw: string) => string
}

export type WorkspaceDependencies = {
	fileSystemRepository: FileSystemRepositoryLike
	settingsRepository: WorkspaceSettingsRepositoryLike
	historyRepository: WorkspaceHistoryRepositoryLike
	openDialog: OpenDialog
	applyWorkspaceMigrations: ApplyWorkspaceMigrations
	generateText: GenerateText
	frontmatterUtils: FrontmatterUtils
	toast: ToastLike
	aiRenameHelpers: AiRenameHelpers
}
