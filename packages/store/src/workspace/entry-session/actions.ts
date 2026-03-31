import { normalizePathSeparators } from "@mdit/utils/path-utils"
import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceEntrySelection } from "../workspace-state"

export type WorkspaceEntrySessionActions = {
	lockAiEntries: (paths: string[]) => void
	unlockAiEntries: (paths: string[]) => void
	setEntrySelection: (selection: WorkspaceEntrySelection) => void
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

	setEntrySelection: ({ selectedIds, anchorId }) => {
		ctx.set({
			selectedEntryPaths: selectedIds,
			selectionAnchorPath: anchorId,
		})
	},

	setSelectedEntryPaths: (paths) => {
		ctx.set({ selectedEntryPaths: paths })
	},

	setSelectionAnchorPath: (path) => {
		ctx.set({ selectionAnchorPath: path })
	},

	resetSelection: () => {
		ctx.get().setEntrySelection({
			selectedIds: new Set(),
			anchorId: null,
		})
	},
})
