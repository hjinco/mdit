export type WorkspaceEntry = {
	path: string
	name: string
	isDirectory: boolean
	children?: WorkspaceEntry[]
	createdAt?: Date
	modifiedAt?: Date
}

export type WorkspaceEntrySelection = {
	selectedIds: Set<string>
	anchorId: string | null
}

export type WorkspaceState = {
	sessionId: number
	isLoading: boolean
	workspacePath: string | null
	recentWorkspacePaths: string[]
	isTreeLoading: boolean
	entries: WorkspaceEntry[]
	expandedDirectories: string[]
	isMigrationsComplete: boolean
	pinnedDirectories: string[]
	aiLockedEntryPaths: Set<string>
	selectedEntryPaths: Set<string>
	selectionAnchorPath: string | null
	currentCollectionPath: string | null
	lastCollectionPath: string | null
}

export type WorkspaceSettings = {
	gitSync?: {
		branchName: string
		commitMessage: string
		autoSync: boolean
	}
	pinnedDirectories?: string[]
	lastOpenedFilePaths?: string[]
	expandedDirectories?: string[]
}

export type FileSystemDirectoryEntry = {
	name: string
	isDirectory: boolean
}

export type FileSystemInfo = {
	isDirectory: boolean
	birthtime?: Date | number | null
	mtime?: Date | number | null
}

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

export type WorkspaceHistory = {
	listWorkspacePaths(): Promise<string[]>
	touchWorkspace(path: string): Promise<void>
	removeWorkspace(path: string): Promise<void>
}

export type FrontmatterUtils = {
	updateFileFrontmatter(
		path: string,
		updates: Record<string, unknown>,
	): Promise<unknown>
	renameFileFrontmatterProperty(
		path: string,
		oldKey: string,
		newKey: string,
	): Promise<unknown>
	removeFileFrontmatterProperty(path: string, key: string): Promise<unknown>
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
