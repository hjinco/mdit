import { useSyncExternalStore } from "react"
import type { StateSource } from "./create-state"
import { getDesktopRuntime } from "./desktop-runtime"

export { getDesktopRuntime } from "./desktop-runtime"

export function useDesktopRuntime() {
	return getDesktopRuntime()
}

function useStateSource<T, U>(
	source: StateSource<T>,
	selector: (state: T) => U,
): U {
	const snapshot = () => selector(source.getSnapshot())
	return useSyncExternalStore(source.subscribe, snapshot, snapshot)
}

type Runtime = ReturnType<typeof useDesktopRuntime>

type SnapshotOf<Key extends keyof Runtime> =
	Runtime[Key] extends StateSource<infer T> ? T : never

export const useDocumentState = <T>(
	selector: (state: SnapshotOf<"documents">) => T,
) => useStateSource(useDesktopRuntime().documents, selector)

export const useWorkspaceState = <T>(
	selector: (state: SnapshotOf<"workspace">) => T,
) => useStateSource(useDesktopRuntime().workspace, selector)

export const useWindowState = <T>(
	selector: (state: SnapshotOf<"window">) => T,
) => useStateSource(useDesktopRuntime().window, selector)

export const useAISettingsState = <T>(
	selector: (state: SnapshotOf<"aiSettings">) => T,
) => useStateSource(useDesktopRuntime().aiSettings, selector)

export const useHotkeysState = <T>(
	selector: (state: SnapshotOf<"hotkeys">) => T,
) => useStateSource(useDesktopRuntime().hotkeys, selector)

export const useIndexingState = <T>(
	selector: (state: SnapshotOf<"indexing">) => T,
) => useStateSource(useDesktopRuntime().indexing, selector)

export const useGitSyncState = <T>(
	selector: (state: SnapshotOf<"gitSync">) => T,
) => useStateSource(useDesktopRuntime().gitSync, selector)
