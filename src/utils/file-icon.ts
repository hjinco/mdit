const IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.svg',
  '.webp',
  '.bmp',
  '.ico',
] as const

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
  let extension: string
  if (PATH_SEGMENT_REGEX.test(pathOrExtension)) {
    // It's a path - extract filename first, then extension
    const segments = pathOrExtension.split(PATH_SEGMENT_REGEX)
    const fileName =
      segments.length > 0
        ? (segments.at(-1) ?? pathOrExtension)
        : pathOrExtension
    const lastDotIndex = fileName.lastIndexOf('.')
    extension = lastDotIndex > 0 ? fileName.slice(lastDotIndex) : ''
  } else {
    // It's already an extension (backward compatible)
    extension = pathOrExtension.startsWith('.')
      ? pathOrExtension
      : `.${pathOrExtension}`
  }

  if (!extension) {
    return false
  }

  return IMAGE_EXTENSIONS.includes(
    extension.toLowerCase() as (typeof IMAGE_EXTENSIONS)[number]
  )
}
