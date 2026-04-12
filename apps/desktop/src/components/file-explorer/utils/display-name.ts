import { getFileNameWithoutExtension } from "@mdit/utils/path-utils"

export function getExplorerEntryDisplayName(
	name: string,
	isDirectory: boolean,
): string {
	if (isDirectory) {
		return name
	}

	return getFileNameWithoutExtension(name)
}
