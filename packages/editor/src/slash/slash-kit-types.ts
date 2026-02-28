import type { FrontmatterRow as KVRow } from "../frontmatter"

export type SlashResolvedImageLink = {
	url: string
	wiki: boolean
	wikiTarget?: string
}

export type SlashHostDeps = {
	pickImageFile?: () => Promise<string | null>
	resolveImageLink?: (path: string) => SlashResolvedImageLink
	getFrontmatterDefaults?: () => Promise<KVRow[]>
}
