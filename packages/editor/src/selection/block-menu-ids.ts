export const BLOCK_DRAG_HANDLE_CONTEXT_MENU_ID = "drag-handle-context"

export const getBlockDragHandleContextMenuId = (blockId: string) =>
	`${BLOCK_DRAG_HANDLE_CONTEXT_MENU_ID}:${blockId}`

export const isBlockDragHandleContextMenuId = (
	openId: string | null | undefined,
) => openId?.startsWith(`${BLOCK_DRAG_HANDLE_CONTEXT_MENU_ID}:`) ?? false
