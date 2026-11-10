import { getFileNameWithoutExtension } from "@mdit/utils/path-utils"

type TitleSaveState = {
	baseline: string
	lastRequested: string
}

export function resolveTitleSaveIntent(
	state: TitleSaveState,
	title: string,
	currentPath: string | undefined,
): TitleSaveState {
	const filename = currentPath ? getFileNameWithoutExtension(currentPath) : null
	// A pending rename can finish after the user has typed a newer title.
	const baseline =
		filename === title || filename === state.lastRequested
			? filename
			: state.baseline
	return { baseline, lastRequested: title === baseline ? "" : title }
}
