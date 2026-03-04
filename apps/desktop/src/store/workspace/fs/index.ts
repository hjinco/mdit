import type { WorkspaceActionContext } from "../workspace-action-context"
import {
	createFsLocalMutationActions,
	type WorkspaceFsLocalMutationActions,
} from "./local-mutation-actions"
import {
	createFsNoteActions,
	type WorkspaceFsNoteActions,
} from "./note-actions"
import {
	createFsStructureActions,
	type WorkspaceFsStructureActions,
} from "./structure-actions"
import {
	createFsTransferActions,
	type WorkspaceFsTransferActions,
} from "./transfer-actions"

export type WorkspaceFsActions = WorkspaceFsLocalMutationActions &
	WorkspaceFsNoteActions &
	WorkspaceFsStructureActions &
	WorkspaceFsTransferActions

export const createFsActions = (
	ctx: WorkspaceActionContext,
): WorkspaceFsActions => ({
	...createFsLocalMutationActions(ctx),
	...createFsNoteActions(ctx),
	...createFsStructureActions(ctx),
	...createFsTransferActions(ctx),
})
