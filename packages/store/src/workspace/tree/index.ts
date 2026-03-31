import type { WorkspaceActionContext } from "../workspace-action-context"
import {
	createTreeActions as createBaseTreeActions,
	type WorkspaceTreeActions as WorkspaceBaseTreeActions,
} from "./actions"
import {
	createTreeEntryActions,
	type WorkspaceTreeEntryActions,
} from "./entry-actions"

export type WorkspaceTreeActions = WorkspaceBaseTreeActions &
	WorkspaceTreeEntryActions

export const createTreeActions = (
	ctx: WorkspaceActionContext,
): WorkspaceTreeActions => ({
	...createBaseTreeActions(ctx),
	...createTreeEntryActions(ctx),
})

export * from "./reconcile"
