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
