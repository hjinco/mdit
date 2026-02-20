export type GitSyncStatus = "syncing" | "synced" | "unsynced" | "error"

export type SyncConfig = {
	branchName: string
	commitMessage: string
	autoSync: boolean
}

export type SyncResult = {
	success: boolean
	pulledChanges: boolean
	error?: string
}

export type GitExecResult = {
	code: number
	stdout: string
	stderr: string
}
