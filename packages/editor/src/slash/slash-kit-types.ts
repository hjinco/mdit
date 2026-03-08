import type { FrontmatterRow as KVRow } from "../frontmatter"
import type { ResolvedEditorImageLink } from "../media/image-insert"

export type SlashResolvedImageLink = ResolvedEditorImageLink

export type SlashHostDeps = {
	pickImageFile?: () => Promise<string | null>
	resolveImageLink?: (
		path: string,
	) => SlashResolvedImageLink | Promise<SlashResolvedImageLink>
	getFrontmatterDefaults?: () => Promise<KVRow[]>
}
