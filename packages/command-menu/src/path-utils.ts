const MARKDOWN_EXTENSION_REGEX = /\.md$/i

export const stripMarkdownExtension = (value: string) =>
	value.replace(MARKDOWN_EXTENSION_REGEX, "")

export const getFileNameFromPath = (path: string) => {
	const segments = path.split(/[/\\]/)
	return segments[segments.length - 1] ?? path
}

export const getParentPathLabel = (path: string) => {
	const normalizedPath = path.replace(/\\/g, "/")
	const segments = normalizedPath.split("/")
	segments.pop()

	const parentPath = segments.join("/").trim()
	return parentPath || "/"
}
