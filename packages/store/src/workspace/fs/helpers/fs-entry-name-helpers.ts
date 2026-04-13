import {
	getPortableEntryNameValidationError,
	sanitizePortableEntryName,
} from "@mdit/utils/portable-filename"

/**
 * Sanitizes user-provided entry names with a shared portable filename policy.
 */
export const sanitizeWorkspaceEntryName = (name: string): string => {
	return sanitizePortableEntryName(name)
}

export const getWorkspaceEntryNameValidationError = (name: string) => {
	return getPortableEntryNameValidationError(name)
}
