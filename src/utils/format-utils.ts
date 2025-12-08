/**
 * Formats a file size in bytes to a human-readable string.
 *
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 KB", "2.3 MB")
 *
 * @example
 * formatFileSize(512) // '512 B'
 * formatFileSize(1536) // '1.5 KB'
 * formatFileSize(2097152) // '2.0 MB'
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
