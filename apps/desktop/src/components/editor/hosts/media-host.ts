import type { MediaHostDeps } from "@mdit/editor/plugins/media-kit"
import { convertFileSrc } from "@tauri-apps/api/core"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"

type DesktopMediaHostRuntimeDeps = {
	useWorkspaceState: MediaHostDeps["useWorkspaceState"]
	toFileUrl: MediaHostDeps["toFileUrl"]
}

const useDesktopWorkspaceState: MediaHostDeps["useWorkspaceState"] = () =>
	useStore(
		useShallow((state) => ({
			tabPath: state.tab?.path ?? null,
			workspacePath: state.workspacePath,
		})),
	)

const defaultRuntimeDeps: DesktopMediaHostRuntimeDeps = {
	useWorkspaceState: useDesktopWorkspaceState,
	toFileUrl: convertFileSrc,
}

export const createDesktopMediaHost = (
	runtimeDeps: DesktopMediaHostRuntimeDeps = defaultRuntimeDeps,
): MediaHostDeps => ({
	useWorkspaceState: runtimeDeps.useWorkspaceState,
	toFileUrl: runtimeDeps.toFileUrl,
})

export const desktopMediaHost = createDesktopMediaHost()
