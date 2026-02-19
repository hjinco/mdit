import type { WorkspaceActionContext } from "../workspace-action-context"
import type { WorkspaceSlice } from "../workspace-slice"

export const createWorkspaceSelectionActions = (
	ctx: WorkspaceActionContext,
): Pick<
	WorkspaceSlice,
	"setSelectedEntryPaths" | "setSelectionAnchorPath" | "resetSelection"
> => ({
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
