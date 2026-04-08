import { relative } from "pathe"
import type { WorkspaceSettings } from "../workspace/workspace-settings"
import { buildPersistedLastOpenedFilePaths } from "./tab-state"
import type { Tab } from "./tab-types"

const MAX_PERSISTED_LAST_OPENED_FILE_PATHS = 5

type PersistedLastOpenedFileState = {
	workspacePath: string | null
	tabs: Tab[]
	activeTabId: number | null
}

type SaveSettings = (
	workspacePath: string,
	settings: Partial<WorkspaceSettings>,
) => Promise<void>

export const createLastOpenedFileHistoryPersistence = ({
	getState,
	saveSettings,
	onError,
}: {
	getState: () => PersistedLastOpenedFileState
	saveSettings: SaveSettings
	onError: (error: unknown) => void
}) => {
	let persistQueue: Promise<void> = Promise.resolve()

	const buildPersistInput = (): {
		workspacePath: string
		lastOpenedFilePaths: string[]
	} | null => {
		const state = getState()
		if (!state.workspacePath) {
			return null
		}
		const workspacePath = state.workspacePath

		return {
			workspacePath,
			lastOpenedFilePaths: buildPersistedLastOpenedFilePaths(
				{
					tabs: state.tabs,
					activeTabId: state.activeTabId,
				},
				MAX_PERSISTED_LAST_OPENED_FILE_PATHS,
			).map((path) => relative(workspacePath, path)),
		}
	}

	const enqueue = (): Promise<void> => {
		const persistInput = buildPersistInput()
		if (!persistInput) {
			return Promise.resolve()
		}

		const persistTask = persistQueue
			.catch(() => {})
			.then(() =>
				saveSettings(persistInput.workspacePath, {
					lastOpenedFilePaths: persistInput.lastOpenedFilePaths,
				}),
			)

		persistQueue = persistTask
		return persistTask
	}

	return {
		enqueue,
		enqueueSafely: () => {
			void enqueue().catch(onError)
		},
	}
}
