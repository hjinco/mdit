export const OBSIDIAN_CALLOUT_TYPES = [
	{ emoji: "📝", label: "Note", value: "note" },
	{ emoji: "📄", label: "Abstract", value: "abstract" },
	{ emoji: "ℹ️", label: "Info", value: "info" },
	{ emoji: "📋", label: "Todo", value: "todo" },
	{ emoji: "💡", label: "Tip", value: "tip" },
	{ emoji: "✅", label: "Success", value: "success" },
	{ emoji: "❓", label: "Question", value: "question" },
	{ emoji: "⚠️", label: "Warning", value: "warning" },
	{ emoji: "❌", label: "Failure", value: "failure" },
	{ emoji: "🚨", label: "Danger", value: "danger" },
	{ emoji: "🐞", label: "Bug", value: "bug" },
	{ emoji: "🧪", label: "Example", value: "example" },
	{ emoji: "💬", label: "Quote", value: "quote" },
	{ emoji: "👀", label: "Attention", value: "attention" },
	{ emoji: "⛔", label: "Caution", value: "caution" },
	{ emoji: "✔️", label: "Check", value: "check" },
	{ emoji: "📚", label: "Cite", value: "cite" },
	{ emoji: "☑️", label: "Done", value: "done" },
	{ emoji: "🛑", label: "Error", value: "error" },
	{ emoji: "💥", label: "Fail", value: "fail" },
	{ emoji: "🙋", label: "FAQ", value: "faq" },
	{ emoji: "🆘", label: "Help", value: "help" },
	{ emoji: "🧭", label: "Hint", value: "hint" },
	{ emoji: "📌", label: "Important", value: "important" },
	{ emoji: "🕳️", label: "Missing", value: "missing" },
	{ emoji: "🗒️", label: "Summary", value: "summary" },
	{ emoji: "✂️", label: "TL;DR", value: "tldr" },
] as const

export const DEFAULT_OBSIDIAN_CALLOUT_TYPE = "note"

export type ObsidianCalloutDefinition = (typeof OBSIDIAN_CALLOUT_TYPES)[number]

export type ObsidianCalloutType =
	(typeof OBSIDIAN_CALLOUT_TYPES)[number]["value"]

export type ObsidianCalloutData = {
	calloutTitle?: string
	calloutType?: string
	defaultFolded?: boolean
	isFoldable?: boolean
}

export type NormalizedObsidianCalloutData = {
	calloutTitle?: string
	calloutType: ObsidianCalloutType
	defaultFolded: boolean
	icon: string
	isFoldable: boolean
}

const OBSIDIAN_CALLOUT_TYPE_SET = new Set<string>(
	OBSIDIAN_CALLOUT_TYPES.map(({ value }) => value),
)

const OBSIDIAN_CALLOUT_TYPES_BY_EMOJI = Object.fromEntries(
	OBSIDIAN_CALLOUT_TYPES.map(({ value, emoji }) => [emoji, value]),
) as Record<string, ObsidianCalloutType>

const OBSIDIAN_CALLOUT_DIRECTIVE_REGEX =
	/^\[!(?<rawType>[^\]]+)\](?<fold>[+-])?(?:\s+(?<title>.*))?$/

export type ParsedObsidianCalloutDirective = {
	rawType: string
	calloutTitle?: string
	calloutType: ObsidianCalloutType
	defaultFolded: boolean
	isFoldable: boolean
}

function normalizeCalloutKey(value: unknown): string {
	if (typeof value !== "string") return ""
	return value.trim().toLowerCase()
}

function normalizeOptionalTitle(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined
	const normalized = value.trim()
	return normalized || undefined
}

export function isObsidianCalloutType(
	value: unknown,
): value is ObsidianCalloutType {
	return OBSIDIAN_CALLOUT_TYPE_SET.has(normalizeCalloutKey(value))
}

export function normalizeObsidianCalloutType(
	value: unknown,
): ObsidianCalloutType {
	const normalized = normalizeCalloutKey(value)

	if (!normalized) return DEFAULT_OBSIDIAN_CALLOUT_TYPE
	if (OBSIDIAN_CALLOUT_TYPE_SET.has(normalized)) {
		return normalized as ObsidianCalloutType
	}

	return DEFAULT_OBSIDIAN_CALLOUT_TYPE
}

export function getObsidianCalloutDefinition(
	value: unknown,
): ObsidianCalloutDefinition {
	const type = normalizeObsidianCalloutType(value)
	return (
		OBSIDIAN_CALLOUT_TYPES.find((definition) => definition.value === type) ??
		OBSIDIAN_CALLOUT_TYPES[0]
	)
}

export function normalizeObsidianCalloutData(
	value: ObsidianCalloutData = {},
): NormalizedObsidianCalloutData {
	const definition = getObsidianCalloutDefinition(value.calloutType)

	return {
		calloutTitle: normalizeOptionalTitle(value.calloutTitle),
		calloutType: definition.value,
		defaultFolded: Boolean(value.defaultFolded),
		icon: definition.emoji,
		isFoldable: Boolean(value.isFoldable),
	}
}

export function getObsidianCalloutLabel(value: unknown): string {
	return getObsidianCalloutDefinition(value).label
}

export function getObsidianCalloutEmoji(value: unknown): string {
	return getObsidianCalloutDefinition(value).emoji
}

export function getObsidianCalloutTypeByEmoji(
	emoji: unknown,
): ObsidianCalloutType | undefined {
	if (typeof emoji !== "string") return undefined
	return OBSIDIAN_CALLOUT_TYPES_BY_EMOJI[emoji]
}

export function getGeneratedCalloutTitle(rawType: string): string {
	const normalized = normalizeCalloutKey(rawType)
	if (!normalized) return ""

	return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase()
}

export function isGeneratedCalloutTitle(
	title: string | undefined,
	rawType: string,
): boolean {
	if (!title) return true
	return title.trim() === getGeneratedCalloutTitle(rawType)
}

export function parseObsidianCalloutDirective(
	value: string,
): ParsedObsidianCalloutDirective | null {
	const match = OBSIDIAN_CALLOUT_DIRECTIVE_REGEX.exec(value.trim())
	const groups = match?.groups
	const rawType = groups?.rawType?.trim()
	if (!rawType) return null

	const title = groups?.title?.trim()
	const fold = groups?.fold
	const normalized = normalizeObsidianCalloutData({
		calloutTitle: title,
		calloutType: rawType,
		defaultFolded: fold === "-",
		isFoldable: fold === "+" || fold === "-",
	})

	return {
		rawType,
		calloutTitle: normalized.calloutTitle,
		calloutType: normalized.calloutType,
		defaultFolded: normalized.defaultFolded,
		isFoldable: normalized.isFoldable,
	}
}

export function formatObsidianCalloutDirective({
	calloutTitle,
	calloutType,
	defaultFolded,
	isFoldable,
}: {
	calloutTitle?: string
	calloutType?: string
	defaultFolded?: boolean
	isFoldable?: boolean
}): string {
	const normalized = normalizeObsidianCalloutData({
		calloutTitle,
		calloutType,
		defaultFolded,
		isFoldable,
	})
	const foldMarker = normalized.isFoldable
		? normalized.defaultFolded
			? "-"
			: "+"
		: ""

	return normalized.calloutTitle
		? `[!${normalized.calloutType}]${foldMarker} ${normalized.calloutTitle}`
		: `[!${normalized.calloutType}]${foldMarker}`
}
