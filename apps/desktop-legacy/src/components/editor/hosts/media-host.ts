import type { MediaHostDeps } from "@mdit/editor/media"
import { convertFileSrc } from "@tauri-apps/api/core"
import { useDocumentState, useWorkspaceState } from "@/state"
import {
	selectActiveTabPath,
	selectDocumentById,
} from "@/state/documents/selectors"

type DesktopMediaHostRuntimeDeps = Partial<
	Pick<MediaHostDeps, "toFileUrl" | "useWorkspaceState">
>

export const createDesktopMediaHost = (
	documentId?: number,
	runtimeDeps: DesktopMediaHostRuntimeDeps = {},
): MediaHostDeps => ({
	useWorkspaceState:
		runtimeDeps.useWorkspaceState ??
		(() => {
			const workspacePath = useWorkspaceState((state) => state.workspacePath)
			const tabPath = useDocumentState((state) =>
				typeof documentId === "number"
					? (selectDocumentById(state, documentId)?.path ?? null)
					: selectActiveTabPath(state),
			)
			return { workspacePath, tabPath }
		}),
	toFileUrl: runtimeDeps.toFileUrl ?? convertFileSrc,
})

export const desktopMediaHost = createDesktopMediaHost()
