const PATH_SEPARATORS_REGEX = /[/\\]/g

/**
 * Sanitizes user-provided entry names by removing path separators to prevent
 * path traversal through file/folder name inputs.
 */
export const sanitizeWorkspaceEntryName = (name: string): string => {
	return name.replace(PATH_SEPARATORS_REGEX, "").trim()
}
