import { normalizeTagQuery } from "../tag/tag-utils"
import {
	convertValueToType,
	datePattern,
	normalizeTagsValue,
	type ValueType,
} from "./frontmatter-value-utils"

const DEFAULT_PROPERTY_TYPE_OPTIONS: ReadonlyArray<{
	value: ValueType
	label: string
}> = [
	{ value: "string", label: "Text" },
	{ value: "number", label: "Number" },
	{ value: "boolean", label: "Boolean" },
	{ value: "date", label: "Date" },
	{ value: "array", label: "Array" },
]

export function isTagsFrontmatterKey(key: string): boolean {
	return key.trim().toLowerCase() === "tags"
}

export function getFrontmatterPropertyTypeOptions(key: string): ReadonlyArray<{
	value: ValueType
	label: string
}> {
	if (isTagsFrontmatterKey(key)) {
		return [{ value: "tags", label: "Tags" }]
	}

	return DEFAULT_PROPERTY_TYPE_OPTIONS
}

export function normalizeFrontmatterTagValue(raw: string): string | null {
	const trimmed = raw.trim()
	if (!trimmed) return null

	const withoutHash = trimmed.startsWith("#")
		? trimmed.slice(1).trim()
		: trimmed

	return withoutHash || null
}

export function normalizeFrontmatterTagItems(value: unknown): string[] {
	return normalizeTagsValue(value)
		.map((item) => normalizeFrontmatterTagValue(item))
		.filter((item): item is string => Boolean(item))
}

const getFrontmatterTagDedupKey = (value: string): string | null => {
	const normalized = normalizeFrontmatterTagValue(value)
	return normalized ? normalized.toLowerCase() : null
}

export function mergeFrontmatterTagItems(
	currentItems: string[],
	nextItems: string[],
): string[] {
	const merged = [...currentItems]
	const seen = new Set(
		currentItems
			.map((item) => getFrontmatterTagDedupKey(item))
			.filter((item): item is string => Boolean(item)),
	)

	for (const item of nextItems) {
		const dedupKey = getFrontmatterTagDedupKey(item)
		if (dedupKey && seen.has(dedupKey)) {
			continue
		}

		merged.push(item)
		if (dedupKey) {
			seen.add(dedupKey)
		}
	}

	return merged
}

export function formatFrontmatterTagLabel(value: string): string {
	const normalized = normalizeFrontmatterTagValue(value)
	if (!normalized) {
		return value.trim()
	}

	return `#${normalized}`
}

export function getFrontmatterTagQuery(value: string): string | null {
	const normalized = normalizeFrontmatterTagValue(value)
	if (!normalized) {
		return null
	}

	return normalizeTagQuery(normalized)
}

export function detectFrontmatterValueType(
	key: string,
	value: unknown,
): ValueType {
	if (isTagsFrontmatterKey(key)) return "tags"
	if (typeof value === "boolean") return "boolean"
	if (typeof value === "number") return "number"
	if (Array.isArray(value)) return "array"
	if (
		value instanceof Date ||
		(typeof value === "string" &&
			!Number.isNaN(Date.parse(value)) &&
			datePattern.test(value))
	) {
		return "date"
	}
	return "string"
}

export function applyFrontmatterTypeChange(
	key: string,
	value: unknown,
	nextType: ValueType,
): { key: string; type: ValueType; value: unknown } {
	if (nextType === "tags") {
		return {
			key: "tags",
			type: "tags",
			value: convertValueToType(value, "tags"),
		}
	}

	const effectiveType = isTagsFrontmatterKey(key) ? "tags" : nextType

	return {
		key,
		type: effectiveType,
		value: convertValueToType(value, effectiveType),
	}
}

export function applyFrontmatterKeyChange(
	nextKey: string,
	currentType: ValueType,
	value: unknown,
): { type: ValueType; value: unknown } {
	if (isTagsFrontmatterKey(nextKey)) {
		return {
			type: "tags" as const,
			value: convertValueToType(value, "tags"),
		}
	}

	if (currentType === "tags") {
		return {
			type: "array" as const,
			value: convertValueToType(value, "array"),
		}
	}

	return {
		type: currentType,
		value,
	}
}
