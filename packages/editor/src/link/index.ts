export { exitLinkForwardAtSelection } from "./link-exit"
export { createLinkKit } from "./link-kit"
export type {
	LinkIndexingConfig,
	LinkWorkspaceEntry,
	LinkWorkspaceState,
	ResolveWikiLinkParams,
	ResolveWikiLinkResult,
	WorkspaceFileOption,
} from "./link-kit-types"
export { type OpenEditorLinkOptions, openEditorLink } from "./link-open"
export type {
	LinkCreateNoteOptions,
	LinkNavigationPort,
	LinkNoteCreationPort,
	LinkOpenPathOptions,
	LinkOpenServices,
	LinkServices,
	LinkSuggestionPort,
	LinkWorkspacePort,
	WikiLinkResolverPort,
} from "./link-ports"
export {
	createPathQueryCandidates,
	ensureUriEncoding,
	flattenWorkspaceFiles,
	formatMarkdownPath,
	getLinkedNoteDisplayName,
	isJavaScriptUrl,
	isPathInsideWorkspaceRoot,
	type LinkMode,
	normalizeMarkdownPathForDisplay,
	normalizeWikiTargetForDisplay,
	normalizeWorkspaceRoot,
	parseInternalLinkTarget,
	resolveInternalLinkPath,
	safelyDecodeUrl,
	stripCurrentDirectoryPrefix,
	stripFileExtensionForDisplay,
	stripLeadingSlashes,
	toWorkspaceRelativeWikiTarget,
} from "./link-toolbar-utils"
export {
	createLinkedNote,
	loadLinkSuggestions,
	resolvePreferredTarget,
} from "./link-use-cases"
export {
	hasParentTraversal,
	isAbsoluteLike,
	startsWithHttpProtocol,
	WINDOWS_ABSOLUTE_REGEX,
} from "./link-utils"
export { normalizePathSeparators } from "./path-utils"
export { WIKI_LINK_PLACEHOLDER_TEXT } from "./wiki-link-constants"
