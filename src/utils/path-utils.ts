const PATH_SEGMENT_REGEX = /[/\\]/

/**
 * Returns the file name (with extension) from a file path.
 * Handles both Windows (`\`) and Unix (`/`) path separators.
 *
 * @param path - The file path
 * @returns The file name or the last segment of the path
 *
 * @example
 * getFileNameFromPath('C:\\Users\\file.txt') // 'file.txt'
 * getFileNameFromPath('/home/user/file.txt') // 'file.txt'
 */
export const getFileNameFromPath = (path: string): string => {
  const segments = path.split(PATH_SEGMENT_REGEX)
  return segments.length > 0 ? (segments.at(-1) ?? path) : path
}

/**
 * Returns the folder name from a directory path.
 * Handles both Windows (`\`) and Unix (`/`) path separators.
 *
 * @param path - The directory path
 * @returns The folder name or the last segment of the path
 *
 * @example
 * getFolderNameFromPath('C:\\Users\\Documents') // 'Documents'
 * getFolderNameFromPath('/home/user/documents') // 'documents'
 */
export const getFolderNameFromPath = (path: string): string => {
  const segments = path.split(PATH_SEGMENT_REGEX)
  // Filter out empty segments (e.g., trailing slashes)
  const nonEmptySegments = segments.filter((seg) => seg.length > 0)
  return nonEmptySegments.length > 0 ? (nonEmptySegments.at(-1) ?? path) : path
}

/**
 * Returns the file name without extension from a file path.
 * Handles both Windows (`\`) and Unix (`/`) path separators.
 *
 * @param path - The file path
 * @returns The file name without extension
 *
 * @example
 * getFileNameWithoutExtension('C:\\Users\\file.txt') // 'file'
 * getFileNameWithoutExtension('/home/user/file.md') // 'file'
 */
export const getFileNameWithoutExtension = (path: string): string => {
  const fileName = getFileNameFromPath(path)
  const lastDotIndex = fileName.lastIndexOf('.')
  return lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName
}
