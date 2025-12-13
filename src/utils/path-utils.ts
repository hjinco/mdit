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
 * Sanitizes a string to be used as a filename by removing invalid characters.
 * Removes characters that are not allowed in filenames: `/ \ : * ? " < > |`
 * and trims whitespace from both ends.
 *
 * @param text - The text to sanitize
 * @returns The sanitized filename-safe string
 *
 * @example
 * sanitizeFilename('My Document: Title?') // 'My Document Title'
 * sanitizeFilename('  File/Name\\Test  ') // 'FileNameTest'
 */
export const sanitizeFilename = (text: string): string => {
  // Remove invalid filename characters: / \ : * ? " < > |
  return text.replace(/[/\\:*?"<>|]/g, '').trim()
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

/**
 * Replaces the file extension with a new one.
 * Handles both Windows (`\`) and Unix (`/`) path separators.
 * Preserves hidden files (e.g., `.env`) by only treating dots after the basename start as extension delimiters.
 *
 * @param filePath - Original file path
 * @param newExtension - New extension (without the dot, e.g., 'png', 'jpeg')
 * @returns File path with new extension
 *
 * @example
 * replaceFileExtension('C:\\Users\\file.txt', 'png') // 'C:\\Users\\file.png'
 * replaceFileExtension('/home/user/archive.tar.gz', 'zip') // '/home/user/archive.tar.zip'
 * replaceFileExtension('/home/user/file', 'txt') // '/home/user/file.txt'
 */
export const replaceFileExtension = (
  filePath: string,
  newExtension: string
): string => {
  const lastSeparator = Math.max(
    filePath.lastIndexOf('/'),
    filePath.lastIndexOf('\\')
  )
  const lastDotIndex = filePath.lastIndexOf('.')
  const basenameStart = lastSeparator + 1 // points to the first char of the filename

  // Only treat the dot as an extension delimiter when:
  // - it appears after the last path separator, and
  // - it is not the leading character of the basename (so hidden files like ".env" are preserved)
  if (lastDotIndex > basenameStart) {
    return `${filePath.slice(0, lastDotIndex)}.${newExtension}`
  }

  // If no valid extension is found, append the new one
  return `${filePath}.${newExtension}`
}

/**
 * Splits a file path into its base path (without extension) and extension.
 * Handles filenames with multiple dots and files without an extension.
 * Handles both Windows (`\`) and Unix (`/`) path separators.
 *
 * @param filePath - The file path
 * @returns Object with basePath and extension (null if no extension)
 *
 * @example
 * getBasePathAndExtension('C:\\Users\\file.txt') // { basePath: 'C:\\Users\\file', extension: 'txt' }
 * getBasePathAndExtension('/home/user/archive.tar.gz') // { basePath: '/home/user/archive.tar', extension: 'gz' }
 * getBasePathAndExtension('/home/user/file') // { basePath: '/home/user/file', extension: null }
 */
export const getBasePathAndExtension = (
  filePath: string
): {
  basePath: string
  extension: string | null
} => {
  const lastSeparator = Math.max(
    filePath.lastIndexOf('/'),
    filePath.lastIndexOf('\\')
  )
  const basenameStart = lastSeparator + 1
  const lastDotIndex = filePath.lastIndexOf('.')

  const hasExtension = lastDotIndex > basenameStart
  if (hasExtension) {
    return {
      basePath: filePath.slice(0, lastDotIndex),
      extension: filePath.slice(lastDotIndex + 1),
    }
  }

  return { basePath: filePath, extension: null }
}

/**
 * Checks if any path in the array contains a "." folder (hidden directory).
 * Handles both Windows (`\`) and Unix (`/`) path separators.
 *
 * @param paths - Array of file or directory paths
 * @returns True if any path contains a segment starting with "."
 *
 * @example
 * hasDotFolderInPaths(['C:\\Users\\.git\\file.txt']) // true
 * hasDotFolderInPaths(['/home/user/.vscode/file.txt']) // true
 * hasDotFolderInPaths(['C:\\Users\\Documents\\file.txt']) // false
 */
export const hasDotFolderInPaths = (paths: string[]): boolean => {
  return paths.some((path) => {
    const segments = path.split(PATH_SEGMENT_REGEX)
    return segments.some((segment) => segment.startsWith('.'))
  })
}
