import {
	INVALID_FILENAME_CHARS_REGEX,
	MARKDOWN_EXT_REGEX,
	MULTIPLE_WHITESPACE_REGEX,
	TRAILING_DOTS_REGEX,
} from "./constants"

export function extractName(raw: string) {
	return raw
		.split("\n")[0]
		.replace(/[`"'<>]/g, " ")
		.trim()
}

export function sanitizeFileName(name: string) {
	const withoutMd = name.replace(MARKDOWN_EXT_REGEX, "")
	const cleaned = withoutMd
		.replace(INVALID_FILENAME_CHARS_REGEX, " ")
		.replace(MULTIPLE_WHITESPACE_REGEX, " ")
		.replace(TRAILING_DOTS_REGEX, "")
		.trim()

	return cleaned.slice(0, 60).trim()
}

export function extractAndSanitizeName(raw: string) {
	return sanitizeFileName(extractName(raw))
}

export function stripExtension(fileName: string, extension: string) {
	return extension && fileName.toLowerCase().endsWith(extension.toLowerCase())
		? fileName.slice(0, -extension.length)
		: fileName
}
