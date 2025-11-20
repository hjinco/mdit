const PATH_SEGMENT_REGEX = /[/\\]/
const BACKSLASH_REGEX = /\\/g
const MULTIPLE_SLASHES_REGEX = /\/{2,}/g

/**
 * Normalizes path separators by converting backslashes to forward slashes,
 * collapsing multiple consecutive slashes, and removing trailing slashes.
 * Ensures consistent path format across different operating systems.
 *
 * @param path - The file or directory path
 * @returns The normalized path with forward slashes
 *
 * @example
 * normalizePathSeparators('C:\\Users\\Documents') // 'C:/Users/Documents'
 * normalizePathSeparators('/home//user//file') // '/home/user/file'
 */
export const normalizePathSeparators = (path: string): string => {
  const withForwardSlashes = path.replace(BACKSLASH_REGEX, '/')
  const collapsed = withForwardSlashes.replace(MULTIPLE_SLASHES_REGEX, '/')
  if (collapsed.length <= 1) {
    return collapsed
  }
  return collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed
}

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

/**
 * Checks if a path is equal to or a descendant of a parent path.
 * Normalizes both paths before comparison to handle Windows/Unix path separator differences.
 *
 * @param path - The path to check
 * @param parentPath - The parent path to compare against
 * @returns True if path equals parentPath or is a descendant of it
 *
 * @example
 * isPathEqualOrDescendant('C:/Users/Documents/file.txt', 'C:/Users') // true
 * isPathEqualOrDescendant('C:\\Users\\Documents', 'C:/Users') // true
 * isPathEqualOrDescendant('/home/user/file.txt', '/home/user') // true
 */
export const isPathEqualOrDescendant = (
  path: string,
  parentPath: string
): boolean => {
  const normalizedPath = normalizePathSeparators(path)
  const normalizedParent = normalizePathSeparators(parentPath)

  if (normalizedPath === normalizedParent) {
    return true
  }

  return normalizedPath.startsWith(`${normalizedParent}/`)
}

/**
 * Checks if a path is equal to or a descendant of any of the target paths.
 * Normalizes all paths before comparison to handle Windows/Unix path separator differences.
 *
 * @param path - The path to check
 * @param targetPaths - Array of target paths to compare against
 * @returns True if path equals any targetPath or is a descendant of any targetPath
 *
 * @example
 * isPathInPaths('C:/Users/Documents/file.txt', ['C:/Users', '/home']) // true
 * isPathInPaths('C:\\Users\\Documents', ['C:/Users']) // true
 */
export const isPathInPaths = (path: string, targetPaths: string[]): boolean => {
  if (targetPaths.length === 0) {
    return false
  }

  for (const targetPath of targetPaths) {
    if (isPathEqualOrDescendant(path, targetPath)) {
      return true
    }
  }

  return false
}
