import type {
	LinkIndexingConfig,
	LinkWorkspaceState,
	ResolveWikiLinkParams,
	ResolveWikiLinkResult,
	WorkspaceFileOption,
} from "./link-kit-types"

export type LinkOpenPathOptions = {
	skipHistory?: boolean
	force?: boolean
}

export type LinkCreateNoteOptions = {
	initialName?: string
	initialContent?: string
	openPath?: boolean
}

export type LinkWorkspacePort = {
	useSnapshot: () => LinkWorkspaceState
	getSnapshot: () => LinkWorkspaceState
}

export type LinkNavigationPort = {
	openExternal: (href: string) => Promise<void> | void
	openPath: (
		path: string,
		options?: LinkOpenPathOptions,
	) => Promise<void> | void
}

export type WikiLinkResolverPort = {
	resolveWikiLink: (
		params: ResolveWikiLinkParams,
	) => Promise<ResolveWikiLinkResult>
}

export type LinkSuggestionPort = {
	getIndexingConfig: (
		workspacePath: string | null,
	) => Promise<LinkIndexingConfig | null>
	getRelatedNotes: (input: {
		workspacePath: string
		currentTabPath: string
		limit: number
	}) => Promise<WorkspaceFileOption[]>
}

export type LinkNoteCreationPort = {
	createNote: (
		directoryPath: string,
		options?: LinkCreateNoteOptions,
	) => Promise<string>
}

export type LinkServices = {
	workspace: LinkWorkspacePort
	navigation: LinkNavigationPort
	resolver?: WikiLinkResolverPort
	suggestions?: LinkSuggestionPort
	noteCreation?: LinkNoteCreationPort
}

export type LinkOpenServices = Pick<
	LinkServices,
	"navigation" | "workspace"
> & {
	resolver?: WikiLinkResolverPort
}
