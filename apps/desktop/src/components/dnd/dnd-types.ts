export type EditorDropPosition = "top" | "bottom"

export type EditorDropTargetData = {
	kind: "editor"
	id?: string
	position?: EditorDropPosition
}

export type FileEntryDragData = {
	path?: string
	isDirectory?: boolean
	name?: string
}

export type EditorDragData = {
	id?: string
}

export type DndOperationEndpoint = {
	id?: string
	data?: unknown
}

export type DndDragEndEvent = {
	operation: {
		source: DndOperationEndpoint
		target?: DndOperationEndpoint | null
	}
	canceled: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

export function isDndOperationEndpoint(
	value: unknown,
): value is DndOperationEndpoint {
	if (!isRecord(value)) {
		return false
	}

	const { id } = value
	return id === undefined || typeof id === "string"
}

export function isDndDragEndEvent(value: unknown): value is DndDragEndEvent {
	if (!isRecord(value)) {
		return false
	}

	const { operation, canceled } = value
	if (typeof canceled !== "boolean" || !isRecord(operation)) {
		return false
	}

	const { source, target } = operation
	return (
		isDndOperationEndpoint(source) &&
		(target === undefined || target === null || isDndOperationEndpoint(target))
	)
}

export function isEditorDropTarget(
	data: unknown,
): data is EditorDropTargetData {
	if (!isRecord(data) || data.kind !== "editor") {
		return false
	}

	const { id, position } = data
	const hasValidId = id === undefined || typeof id === "string"
	const hasValidPosition =
		position === undefined || position === "top" || position === "bottom"

	return hasValidId && hasValidPosition
}

export function isFileEntryDragData(data: unknown): data is FileEntryDragData {
	if (!isRecord(data)) {
		return false
	}

	const hasKnownKey = "path" in data || "isDirectory" in data || "name" in data
	if (!hasKnownKey) {
		return false
	}

	const { path, isDirectory, name } = data
	return (
		(path === undefined || typeof path === "string") &&
		(isDirectory === undefined || typeof isDirectory === "boolean") &&
		(name === undefined || typeof name === "string")
	)
}

export function isEditorDragData(data: unknown): data is EditorDragData {
	if (!isRecord(data) || !("id" in data)) {
		return false
	}

	const { id } = data
	return id === undefined || typeof id === "string"
}
