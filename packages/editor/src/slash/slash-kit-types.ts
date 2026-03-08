import type { FrontmatterRow as KVRow } from "../frontmatter"
import type { ResolvedEditorImageLink } from "../media/image-insert"
import type {
	EditorImageLinkErrorHandler,
	EditorImageLinkResolver,
} from "../media/image-link-resolver"

export type SlashResolvedImageLink = ResolvedEditorImageLink

export type SlashHostDeps = {
	pickImageFile?: () => Promise<string | null>
	resolveImageLink?: EditorImageLinkResolver
	onResolveImageLinkError?: EditorImageLinkErrorHandler
	getFrontmatterDefaults?: () => Promise<KVRow[]>
}
