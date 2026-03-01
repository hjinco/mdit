import { KEYS } from "platejs"

const BULLETED_LIST_STYLES = ["disc", "circle", "square"] as const

type BulletedListStyle = (typeof BULLETED_LIST_STYLES)[number]

export function resolveListStyleTypeByIndent(
	listStyleType: string,
	indent?: number,
) {
	if (listStyleType !== KEYS.ul) {
		return listStyleType
	}

	return resolveBulletedListStyleByIndent(indent)
}

export function resolveBulletedListStyleByIndent(
	indent?: number,
): BulletedListStyle {
	const normalizedIndent =
		typeof indent === "number" && Number.isFinite(indent) && indent > 0
			? Math.floor(indent)
			: 1

	return BULLETED_LIST_STYLES[
		(normalizedIndent - 1) % BULLETED_LIST_STYLES.length
	]
}
