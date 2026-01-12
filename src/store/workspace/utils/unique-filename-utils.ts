import { join } from 'pathe'

export type UniqueFileNamePattern = 'space' | 'parentheses'

export interface GenerateUniqueFileNameOptions {
  pattern?: UniqueFileNamePattern
  maxAttempts?: number
}

export interface UniqueFileNameResult {
  fileName: string
  fullPath: string
}

/**
 * Generates a unique file or folder name by appending a number suffix if the name already exists.
 * Supports two naming patterns:
 * - Space pattern: "name 1", "name 2" (preserves extension if present)
 * - Parentheses pattern: "name (1)", "name (2)" (preserves extension if present)
 *
 * @param baseName - The base file/folder name (with or without extension)
 * @param directoryPath - Target directory path
 * @param exists - Async function to check if a path exists
 * @param options - Optional configuration
 * @returns Object containing the unique fileName and fullPath
 *
 * @example
 * // Space pattern (default)
 * const result = await generateUniqueFileName('file.txt', '/path/to/dir', exists)
 * // Returns: { fileName: 'file 1.txt', fullPath: '/path/to/dir/file 1.txt' }
 *
 * @example
 * // Parentheses pattern
 * const result = await generateUniqueFileName('file.txt', '/path/to/dir', exists, { pattern: 'parentheses' })
 * // Returns: { fileName: 'file (1).txt', fullPath: '/path/to/dir/file (1).txt' }
 */
export async function generateUniqueFileName(
  baseName: string,
  directoryPath: string,
  exists: (path: string) => Promise<boolean>,
  options: GenerateUniqueFileNameOptions = {}
): Promise<UniqueFileNameResult> {
  const { pattern = 'space', maxAttempts = 100 } = options

  // Extract extension if present
  const extIndex = baseName.lastIndexOf('.')
  const hasExtension = extIndex > 0
  const baseNameWithoutExt = hasExtension
    ? baseName.slice(0, extIndex)
    : baseName
  const extension = hasExtension ? baseName.slice(extIndex) : ''

  let attempt = 0
  let fileName: string
  let fullPath: string

  while (attempt <= maxAttempts) {
    // Generate suffix based on pattern
    let suffix: string
    if (attempt === 0) {
      suffix = ''
    } else if (pattern === 'parentheses') {
      suffix = ` (${attempt})`
    } else {
      // space pattern
      suffix = ` ${attempt}`
    }

    // Construct fileName with suffix and extension
    fileName = `${baseNameWithoutExt}${suffix}${extension}`
    fullPath = join(directoryPath, fileName)

    // Check if path exists
    if (!(await exists(fullPath))) {
      return { fileName, fullPath }
    }

    attempt += 1
  }

  throw new Error(
    `Unable to generate unique filename after ${maxAttempts} attempts`
  )
}
