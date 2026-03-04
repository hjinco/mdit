import { normalizePathSeparators } from "@/utils/path-utils"
import type { WorkspaceActionContext } from "../workspace-action-context"

export type WorkspaceEntrySessionActions = {
	lockAiEntries: (paths: string[]) => void
	unlockAiEntries: (paths: string[]) => void
	setSelectedEntryPaths: (paths: Set<string>) => void
	setSelectionAnchorPath: (path: string | null) => void
	resetSelection: () => void
}

export const createEntrySessionActions = (
	ctx: WorkspaceActionContext,
): WorkspaceEntrySessionActions => ({
	lockAiEntries: (paths) => {
		if (paths.length === 0) {
			return
		}
		ctx.set((state) => {
			const next = new Set(state.aiLockedEntryPaths)
			for (const path of paths) {
				next.add(normalizePathSeparators(path))
			}
			return { aiLockedEntryPaths: next }
		})
	},

	unlockAiEntries: (paths) => {
		if (paths.length === 0) {
			return
		}
		ctx.set((state) => {
			const next = new Set(state.aiLockedEntryPaths)
			for (const path of paths) {
				next.delete(normalizePathSeparators(path))
			}
			return { aiLockedEntryPaths: next }
		})
	},

	setSelectedEntryPaths: (paths) => {
		ctx.set({ selectedEntryPaths: paths })
	},

	setSelectionAnchorPath: (path) => {
		ctx.set({ selectionAnchorPath: path })
	},

	resetSelection: () => {
		ctx.set({
			selectedEntryPaths: new Set(),
			selectionAnchorPath: null,
		})
	},
})
