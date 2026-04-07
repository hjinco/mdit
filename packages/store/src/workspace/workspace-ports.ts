import type { TabSlice } from "../tab/tab-slice"

export type WorkspacePorts = {
	tab: Pick<TabSlice, "getOpenTabSnapshots" | "getActiveTabPath">
}

type WorkspacePortSource = TabSlice

export const createWorkspacePorts = (
	get: () => WorkspacePortSource,
): WorkspacePorts => ({
	tab: {
		getOpenTabSnapshots: () => get().getOpenTabSnapshots(),
		getActiveTabPath: () => get().getActiveTabPath(),
	},
})
