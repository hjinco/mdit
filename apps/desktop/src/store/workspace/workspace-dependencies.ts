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
	listWorkspacePaths: () => Promise<string[]>
	touchWorkspace: (path: string) => Promise<void>
	removeWorkspace: (path: string) => Promise<void>
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

export type BacklinkEntry = {
	relPath: string
	fileName: string
}

export type ResolveWikiLinkResult = {
	canonicalTarget: string
	resolvedRelPath?: string | null
	matchCount: number
	disambiguated: boolean
	unresolved: boolean
}

export type LinkIndexingDependencies = {
	getBacklinks: (
		workspacePath: string,
		filePath: string,
	) => Promise<BacklinkEntry[]>
	resolveWikiLink: (input: {
		workspacePath: string
		currentNotePath?: string | null
		rawTarget: string
	}) => Promise<ResolveWikiLinkResult>
	indexNote: (workspacePath: string, notePath: string) => Promise<void>
	renameIndexedNote: (
		workspacePath: string,
		oldNotePath: string,
		newNotePath: string,
	) => Promise<boolean>
	deleteIndexedNote: (
		workspacePath: string,
		notePath: string,
	) => Promise<boolean>
}

export type WorkspaceDependencies = {
	fileSystemRepository: FileSystemRepositoryLike
	settingsRepository: WorkspaceSettingsRepositoryLike
	historyRepository: WorkspaceHistoryRepositoryLike
	openDialog: OpenDialog
	applyWorkspaceMigrations: ApplyWorkspaceMigrations
	frontmatterUtils: FrontmatterUtils
	toast: ToastLike
	linkIndexing: LinkIndexingDependencies
}
