const UNSAVED_TAB_CHECK_DELAY_MS = 200
const MAX_UNSAVED_TAB_CHECKS = 5

const delay = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms))

type TabLike = { path: string }

type TabStoreSnapshot<TTab extends TabLike = TabLike> = {
	tab: TTab | null
	isSaved: boolean
}

/**
 * Polls the provided tab-store getter until the target path is saved or the
 * maximum attempts have been reached. Returns the latest tab store snapshot.
 */
export async function waitForUnsavedTabToSettle<
	TState extends TabStoreSnapshot,
>(targetPath: string, getTabState: () => TState): Promise<TState> {
	let tabState = getTabState()

	if (targetPath !== tabState.tab?.path) {
		return tabState
	}

	for (let attempts = 0; attempts < MAX_UNSAVED_TAB_CHECKS; attempts++) {
		if (tabState.isSaved) {
			break
		}

		await delay(UNSAVED_TAB_CHECK_DELAY_MS)
		tabState = getTabState()
	}

	return tabState
}
