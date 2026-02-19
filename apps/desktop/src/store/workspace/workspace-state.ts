import type { UnwatchFn } from "@tauri-apps/plugin-fs"

export type WorkspaceEntry = {
	path: string
	name: string
	isDirectory: boolean
	children?: WorkspaceEntry[]
	createdAt?: Date
	modifiedAt?: Date
}

export type WorkspaceState = {
	isLoading: boolean
	isEditMode: boolean
	workspacePath: string | null
	recentWorkspacePaths: string[]
	isTreeLoading: boolean
	entries: WorkspaceEntry[]
	expandedDirectories: string[]
	isMigrationsComplete: boolean
	pinnedDirectories: string[]
	lastFsOperationTime: number | null
	selectedEntryPaths: Set<string>
	selectionAnchorPath: string | null
	unwatchFn: UnwatchFn | null
}

export const buildWorkspaceState = (
	overrides?: Partial<WorkspaceState>,
): WorkspaceState => ({
	isLoading: false,
	isEditMode: false,
	workspacePath: null,
	recentWorkspacePaths: [],
	entries: [],
	isTreeLoading: false,
	expandedDirectories: [],
	isMigrationsComplete: false,
	pinnedDirectories: [],
	lastFsOperationTime: null,
	selectedEntryPaths: new Set(),
	selectionAnchorPath: null,
	unwatchFn: null,
	...overrides,
})
