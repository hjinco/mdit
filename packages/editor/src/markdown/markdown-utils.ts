export function getPlainText(value: unknown): string {
	if (value == null) return ""
	if (typeof value === "string") return value
	if (Array.isArray(value)) return value.map(getPlainText).join("")
	if (typeof value === "object") {
		const maybeText = value as {
			children?: unknown
			text?: string
			value?: string
		}
		if (typeof maybeText.text === "string") return maybeText.text
		if (typeof maybeText.value === "string") return maybeText.value
		if (maybeText.children) return getPlainText(maybeText.children)
	}
	return ""
}
