const RELATIVE_PATH_SEGMENT_REGEX = /[/\\]/

// Return the file name or final segment of a workspace path.
export const getFileNameFromPath = (path: string) => {
  const segments = path.split(RELATIVE_PATH_SEGMENT_REGEX)
  return segments.length > 0 ? (segments.at(-1) ?? path) : path
}
