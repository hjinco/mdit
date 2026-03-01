import { BlockSelectionPlugin } from "@platejs/selection/react"
import { extname } from "pathe"
import { KEYS, type Path, PathApi } from "platejs"
import type { PlateEditor } from "platejs/react"
import { buildImageLinkData } from "@/components/editor/utils/image-link"
import { isImageFile } from "@/utils/file-icon"
import {
	type DndDragEndEvent,
	type EditorDropPosition,
	type EditorDropTargetData,
	type FileEntryDragData,
	isEditorDragData,
	isEditorDropTarget,
	isFileEntryDragData,
} from "./dnd-types"

type BlockNode = {
	id?: string
	type?: string
	[key: string]: unknown
}

type BlockEntry = [BlockNode, Path]
type EditorInsertNodes = Parameters<PlateEditor["tf"]["insertNodes"]>[0]

type HandleEditorDropParams = {
	event: DndDragEndEvent
	editor: PlateEditor
	selectedEntryPaths: Set<string>
}

type HandleFileDropToEditorParams = {
	activeData: FileEntryDragData
	editor: PlateEditor
	overData: EditorDropTargetData
	selectedEntryPaths: Set<string>
}

type HandleBlockDropToEditorParams = {
	activeData: unknown
	editor: PlateEditor
	overData: EditorDropTargetData
}

type HandleMultiBlockMoveParams = {
	editor: PlateEditor
	position: EditorDropPosition
	selectedBlocks: BlockEntry[]
	targetId: string
	targetPath: Path
}

function collectImagePaths(
	activeData: FileEntryDragData,
	selectedEntryPaths: Set<string>,
) {
	const activePath = activeData.path
	if (!activePath || activeData.isDirectory) {
		return []
	}

	const selection = Array.from(selectedEntryPaths)
	const candidatePaths = selection.includes(activePath)
		? selection
		: [activePath]

	return candidatePaths.filter((path) => {
		const extension = extname(path)
		return extension ? isImageFile(extension) : false
	})
}

function findBlockEntryById(
	editor: PlateEditor,
	id: string,
): BlockEntry | undefined {
	return editor.api.node({
		at: [],
		block: true,
		match: (node) => (node as BlockNode).id === id,
	}) as BlockEntry | undefined
}

function handleFileDropToEditor({
	activeData,
	editor,
	overData,
	selectedEntryPaths,
}: HandleFileDropToEditorParams): boolean {
	const imagePaths = collectImagePaths(activeData, selectedEntryPaths)
	if (!overData.id || imagePaths.length === 0) {
		return true
	}

	const targetEntry = findBlockEntryById(editor, overData.id)
	if (!targetEntry) {
		return true
	}

	const [targetNode, targetPath] = targetEntry
	const isCodeOrTable =
		targetNode.type === editor.getType(KEYS.codeBlock) ||
		targetNode.type === editor.getType(KEYS.table)
	const position = overData.position ?? "bottom"
	const insertPath = isCodeOrTable ? PathApi.next(targetPath) : targetPath

	for (const imagePath of imagePaths) {
		const imageData = buildImageLinkData(imagePath)
		const imageNode = {
			type: editor.getType(KEYS.img),
			url: imageData.url,
			...(imageData.wiki
				? { wiki: true, wikiTarget: imageData.wikiTarget }
				: {}),
			children: [{ text: "" }],
		}

		editor.tf.insertNodes(imageNode, {
			at: insertPath,
			nextBlock: position === "bottom" && !isCodeOrTable,
		})
	}

	return true
}

function getTopLevelSelectedBlocks(selectedBlocks: BlockEntry[]): BlockEntry[] {
	return selectedBlocks.filter(([, path]) => {
		return !selectedBlocks.some(
			([, otherPath]) =>
				otherPath !== path && PathApi.isDescendant(path, otherPath),
		)
	})
}

function hasNoopMultiMove(
	position: EditorDropPosition,
	sortedBlocks: BlockEntry[],
	targetPath: Path,
): boolean {
	const firstSelectedPath = sortedBlocks[0]?.[1]
	const lastSelectedPath = sortedBlocks.at(-1)?.[1]

	if (
		position === "top" &&
		lastSelectedPath &&
		PathApi.isSibling(lastSelectedPath, targetPath) &&
		PathApi.equals(PathApi.next(lastSelectedPath), targetPath)
	) {
		return true
	}

	if (
		position === "bottom" &&
		firstSelectedPath &&
		PathApi.isSibling(firstSelectedPath, targetPath) &&
		PathApi.equals(firstSelectedPath, PathApi.next(targetPath))
	) {
		return true
	}

	return false
}

function handleMultiBlockMove({
	editor,
	position,
	selectedBlocks,
	targetId,
	targetPath,
}: HandleMultiBlockMoveParams): boolean {
	const blocksToMove = getTopLevelSelectedBlocks(selectedBlocks)
	if (blocksToMove.length === 0) {
		return true
	}

	const isTargetDescendant = blocksToMove.some(([, path]) =>
		PathApi.isDescendant(targetPath, path),
	)
	if (isTargetDescendant) {
		return true
	}

	const isTargetSelected = blocksToMove.some(([node]) => node.id === targetId)
	if (isTargetSelected) {
		return true
	}

	const sortedBlocks = [...blocksToMove].sort((a, b) => {
		const [, pathA] = a
		const [, pathB] = b
		return PathApi.compare(pathA, pathB)
	})
	if (hasNoopMultiMove(position, sortedBlocks, targetPath)) {
		return true
	}

	const blockSelectionApi = editor.getApi(BlockSelectionPlugin)
	const idsToMove = sortedBlocks
		.map(([node]) => node.id)
		.filter((id): id is string => typeof id === "string")

	editor.tf.withoutNormalizing(() => {
		const nodesToMove = sortedBlocks.map(([node]) => node) as EditorInsertNodes

		for (const [, path] of [...sortedBlocks].reverse()) {
			editor.tf.removeNodes({ at: path })
		}

		const currentTargetEntry = findBlockEntryById(editor, targetId)
		if (!currentTargetEntry) {
			return
		}

		const [, currentTargetPath] = currentTargetEntry
		const insertAt =
			position === "top" ? currentTargetPath : PathApi.next(currentTargetPath)
		editor.tf.insertNodes(nodesToMove, { at: insertAt })
	})

	blockSelectionApi.blockSelection.set(idsToMove)
	return true
}

function handleSingleBlockMove({
	editor,
	position,
	sourceId,
	targetPath,
}: {
	editor: PlateEditor
	position: EditorDropPosition
	sourceId: string
	targetPath: Path
}): boolean {
	const sourceEntry = findBlockEntryById(editor, sourceId)
	if (!sourceEntry) {
		return true
	}

	const [, sourcePath] = sourceEntry
	if (PathApi.equals(sourcePath, targetPath)) {
		return true
	}

	if (PathApi.isDescendant(targetPath, sourcePath)) {
		return true
	}

	const areAdjacentSiblings =
		PathApi.isSibling(sourcePath, targetPath) &&
		Math.abs((sourcePath.at(-1) ?? 0) - (targetPath.at(-1) ?? 0)) === 1
	if (areAdjacentSiblings) {
		const sourceIndex = sourcePath.at(-1) ?? 0
		const targetIndex = targetPath.at(-1) ?? 0

		if (position === "top" && sourceIndex === targetIndex - 1) {
			return true
		}

		if (position === "bottom" && sourceIndex === targetIndex + 1) {
			return true
		}
	}

	const areSiblings = PathApi.isSibling(sourcePath, targetPath)
	const isMovingDown = areSiblings && PathApi.isBefore(sourcePath, targetPath)
	const moveToPath =
		position === "top"
			? isMovingDown
				? (PathApi.previous(targetPath) ?? targetPath)
				: targetPath
			: isMovingDown
				? targetPath
				: PathApi.next(targetPath)

	editor.tf.moveNodes({
		at: sourcePath,
		to: moveToPath,
	})

	const movedEntry = editor.api.node({
		at: moveToPath,
		block: true,
	}) as BlockEntry | undefined
	if (!movedEntry) {
		return true
	}

	const [movedNode] = movedEntry
	if (typeof movedNode.id === "string") {
		editor.getApi(BlockSelectionPlugin).blockSelection.set(movedNode.id)
	}

	return true
}

function handleBlockDropToEditor({
	activeData,
	editor,
	overData,
}: HandleBlockDropToEditorParams): boolean {
	if (!isEditorDragData(activeData) || !activeData.id || !overData.id) {
		return true
	}

	const sourceId = activeData.id
	const targetId = overData.id
	if (sourceId === targetId) {
		return true
	}

	const targetEntry = findBlockEntryById(editor, targetId)
	if (!targetEntry) {
		return true
	}

	const position = overData.position ?? "top"
	const [, targetPath] = targetEntry

	const blockSelectionApi = editor.getApi(BlockSelectionPlugin)
	const selectedBlocks = blockSelectionApi.blockSelection.getNodes({
		sort: true,
	}) as BlockEntry[]
	const isDraggedBlockSelected = selectedBlocks.some(
		([node]) => node.id === sourceId,
	)

	if (isDraggedBlockSelected && selectedBlocks.length > 1) {
		return handleMultiBlockMove({
			editor,
			position,
			selectedBlocks,
			targetId,
			targetPath,
		})
	}

	return handleSingleBlockMove({
		editor,
		position,
		sourceId,
		targetPath,
	})
}

export function handleEditorDrop({
	event,
	editor,
	selectedEntryPaths,
}: HandleEditorDropParams): boolean {
	const overData = event.operation.target?.data
	if (!isEditorDropTarget(overData)) {
		return false
	}

	const activeData = event.operation.source.data
	if (isFileEntryDragData(activeData)) {
		return handleFileDropToEditor({
			activeData,
			editor,
			overData,
			selectedEntryPaths,
		})
	}

	return handleBlockDropToEditor({
		activeData,
		editor,
		overData,
	})
}
