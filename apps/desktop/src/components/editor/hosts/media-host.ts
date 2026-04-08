import type { MediaHostDeps } from "@mdit/editor/media"
import { convertFileSrc } from "@tauri-apps/api/core"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"

type DesktopMediaHostRuntimeDeps = Partial<
	Pick<MediaHostDeps, "toFileUrl" | "useWorkspaceState">
>

const defaultRuntimeDeps: DesktopMediaHostRuntimeDeps = {
	toFileUrl: convertFileSrc,
}

export const createDesktopMediaHost = (
	documentId?: number,
	runtimeDeps: DesktopMediaHostRuntimeDeps = defaultRuntimeDeps,
): MediaHostDeps => ({
	useWorkspaceState:
		runtimeDeps.useWorkspaceState ??
		(() =>
			useStore(
				useShallow((state) => ({
					tabPath:
						typeof documentId === "number"
							? (state.getDocumentById(documentId)?.path ?? null)
							: state.getActiveTabPath(),
					workspacePath: state.workspacePath,
				})),
			)),
	toFileUrl: runtimeDeps.toFileUrl ?? convertFileSrc,
})

export const desktopMediaHost = createDesktopMediaHost()
