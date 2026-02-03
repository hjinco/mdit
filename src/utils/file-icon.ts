import mime from "mime/lite"

const PATH_SEGMENT_REGEX = /[/\\]/

/**
 * Checks if a file path or extension corresponds to an image file.
 * Accepts both full file paths and file extensions.
 *
 * @param pathOrExtension - A file path (e.g., '/path/to/image.jpg') or extension (e.g., '.jpg')
 * @returns true if the file is an image file, false otherwise
 *
 * @example
 * isImageFile('/path/to/image.jpg') // true
 * isImageFile('.jpg') // true
 * isImageFile('file.txt') // false
 */
export function isImageFile(pathOrExtension: string): boolean {
	// Extract extension from path if it contains path separators
	let filename: string
	if (PATH_SEGMENT_REGEX.test(pathOrExtension)) {
		// It's a path - extract filename first
		const segments = pathOrExtension.split(PATH_SEGMENT_REGEX)
		filename =
			segments.length > 0
				? (segments.at(-1) ?? pathOrExtension)
				: pathOrExtension
	} else {
		// It's already an extension - convert to filename format for mime
		filename = pathOrExtension.startsWith(".")
			? `file${pathOrExtension}`
			: `file.${pathOrExtension}`
	}

	if (!filename) {
		return false
	}

	// Get MIME type from filename using mime/lite
	const mimeType = mime.getType(filename)

	// Check if MIME type exists and starts with 'image/'
	return mimeType?.startsWith("image/") ?? false
}
