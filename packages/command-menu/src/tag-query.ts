const TAG_SEGMENT_REGEX = /^[\p{L}\p{N}_-]+$/u

export function normalizeTagSearchValue(raw: string): string | null {
	let value = raw.trim()
	if (value.startsWith("#")) {
		value = value.slice(1)
	}

	value = value.trim().toLowerCase()
	if (!value) {
		return null
	}

	const segments = value.split("/")
	if (
		segments.length === 0 ||
		segments.some((segment) => !segment || !TAG_SEGMENT_REGEX.test(segment))
	) {
		return null
	}

	return segments.join("/")
}

export function normalizeTagSearchQuery(raw: string): string | null {
	const normalized = normalizeTagSearchValue(raw)
	return normalized ? `#${normalized}` : null
}

export function getTagOnlySearchQuery(raw: string): string | null {
	if (!isTagOnlyQuery(raw)) {
		return null
	}

	return normalizeTagSearchQuery(raw)
}

export function isTagOnlyQuery(raw: string): boolean {
	const trimmed = raw.trim()
	if (!trimmed.startsWith("#")) {
		return false
	}

	if (/\s/.test(trimmed)) {
		return false
	}

	return normalizeTagSearchQuery(trimmed) !== null
}
