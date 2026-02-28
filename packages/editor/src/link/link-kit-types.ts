export type LinkWorkspaceEntry = {
	path: string
	name: string
	isDirectory: boolean
	children?: LinkWorkspaceEntry[]
}

export type WorkspaceFileOption = {
	absolutePath: string
	displayName: string
	relativePath: string
	relativePathLower: string
}

export type LinkWorkspaceState = {
	workspacePath: string | null
	tab: {
		path: string | null
	} | null
	entries: LinkWorkspaceEntry[]
}

export type LinkIndexingConfig = {
	embeddingProvider: string
	embeddingModel: string
}

export type ResolveWikiLinkResult = {
	canonicalTarget: string
	resolvedRelPath?: string | null
	matchCount: number
	disambiguated: boolean
	unresolved: boolean
}

export type ResolveWikiLinkParams = {
	workspacePath: string
	currentNotePath?: string | null
	rawTarget: string
	workspaceRelPaths?: string[]
}
