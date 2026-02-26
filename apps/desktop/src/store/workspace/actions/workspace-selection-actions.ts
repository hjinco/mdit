import { normalizePathSeparators } from "@/utils/path-utils"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceSlice } from "../workspace-slice"

export const createWorkspaceSelectionActions = (
	ctx: WorkspaceActionContext,
): Pick<
	WorkspaceSlice,
	| "lockAiEntries"
	| "unlockAiEntries"
	| "setSelectedEntryPaths"
	| "setSelectionAnchorPath"
	| "resetSelection"
> => ({
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
