import type { VaultWatchBatchPayload } from "./watch/types"
import type { WorkspaceSettings } from "./workspace-settings"

export type FileSystemDirectoryEntry = {
	name: string
	isDirectory: boolean
}

export type FileSystemInfo = {
	isDirectory: boolean
	birthtime?: Date | number | null
	mtime?: Date | number | null
}

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
	readDir: (path: string) => Promise<FileSystemDirectoryEntry[]>
	readTextFile: (path: string) => Promise<string>
	rename: (sourcePath: string, destinationPath: string) => Promise<void>
	writeTextFile: (path: string, contents: string) => Promise<void>
	moveToTrash: (path: string) => Promise<void>
	moveManyToTrash: (paths: string[]) => Promise<void>
	copy: (sourcePath: string, destinationPath: string) => Promise<void>
	stat: (path: string) => Promise<FileSystemInfo>
}

export type WorkspaceSettingsRepositoryLike = {
	loadSettings: (workspacePath: string) => Promise<WorkspaceSettings>
	getPinnedDirectoriesFromSettings: (
		workspacePath: string | null,
		settings: WorkspaceSettings | null | undefined,
	) => string[]
	getExpandedDirectoriesFromSettings: (
		workspacePath: string | null,
		settings: WorkspaceSettings | null | undefined,
	) => string[]
	persistPinnedDirectories: (
		workspacePath: string | null,
		pinnedDirectories: string[],
	) => Promise<void>
	persistExpandedDirectories: (
		workspacePath: string | null,
		expandedDirectories: string[],
	) => Promise<void>
}

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

export type WorkspaceWatcher = {
	start: (workspacePath: string) => Promise<void>
	stop: (workspacePath: string) => Promise<void>
	subscribe: (
		listener: (payload: VaultWatchBatchPayload) => void,
	) => Promise<() => void>
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
	watcher: WorkspaceWatcher
}
