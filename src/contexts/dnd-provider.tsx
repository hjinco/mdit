import { DragDropProvider, DragOverlay, PointerSensor } from "@dnd-kit/react"
import { BlockSelectionPlugin } from "@platejs/selection/react"
import { extname } from "pathe"
import { KEYS, PathApi } from "platejs"
import { useEditorRef } from "platejs/react"
import type React from "react"
import { useCallback } from "react"
import { useShallow } from "zustand/react/shallow"
import { buildImageLinkData } from "@/components/editor/utils/image-link"
import { useStore } from "@/store"
import { isImageFile } from "@/utils/file-icon"
import { isPathEqualOrDescendant } from "@/utils/path-utils"

type DndProviderProps = {
	children: React.ReactNode
}

export function DndProvider({ children }: DndProviderProps) {
	const editor = useEditorRef()
	const { moveEntry, selectedEntryPaths, resetSelection } = useStore(
		useShallow((state) => ({
			moveEntry: state.moveEntry,
			selectedEntryPaths: state.selectedEntryPaths,
			resetSelection: state.resetSelection,
		})),
	)

	const collectImagePaths = useCallback(
		(activeData: { path?: string; isDirectory?: boolean } | undefined) => {
			const activePath = activeData?.path
			if (!activePath || activeData?.isDirectory) {
				return []
			}

			const selection = Array.from(selectedEntryPaths)
			const candidatePaths = selection.includes(activePath)
				? selection
				: [activePath]

			const filterImagePaths = (paths: string[]) =>
				paths.filter((path) => {
					const extension = extname(path)
					return extension ? isImageFile(extension) : false
				})

			return filterImagePaths(candidatePaths)
		},
		[selectedEntryPaths],
	)

	const sensors = [
		PointerSensor.configure({
			activationConstraints: {
				distance: { value: 4 },
			},
		}),
	]

	const handleDragEnd = useCallback(
		async (event: {
			operation: { source: any; target: any }
			canceled: boolean
		}) => {
			const { operation, canceled } = event
			if (canceled) {
				return
			}

			const { source, target } = operation
			const overData = target?.data as
				| { kind: "editor"; id?: string; position?: "top" | "bottom" }
				| undefined
			if (overData?.kind === "editor") {
				const activeData = source.data as
					| { path?: string; isDirectory?: boolean }
					| { id?: string }
				if ("path" in activeData) {
					const imagePaths = collectImagePaths(activeData)
					if (!overData.id || imagePaths.length === 0) {
						return
					}

					const entry = editor.api.node({
						at: [],
						block: true,
						match: (n) => (n as any).id === overData.id,
					})

					if (!entry) {
						return
					}

					const [node, path] = entry

					// Determine insertion path based on drop position
					const position = overData.position ?? "bottom"
					let insertPath = path

					if (
						node.type === editor.getType(KEYS.codeBlock) ||
						node.type === editor.getType(KEYS.table)
					) {
						// Insert after the target block
						// For code blocks and tables, use next path
						insertPath = PathApi.next(path)
					}

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
							// For top position, insert before (nextBlock: false)
							// For bottom position with non-code/table blocks, use nextBlock
							nextBlock:
								position === "bottom" &&
								node.type !== editor.getType(KEYS.codeBlock) &&
								node.type !== editor.getType(KEYS.table),
						})
					}
				} else if ("id" in activeData && activeData.id && overData.id) {
					// Block-to-block drag and drop reordering
					const sourceId = activeData.id
					const targetId = overData.id

					// Don't move if source and target are the same
					if (sourceId === targetId) {
						return
					}

					// Get selected blocks from BlockSelectionPlugin
					const blockSelectionApi = editor.getApi(BlockSelectionPlugin)
					const selectedBlocks = blockSelectionApi.blockSelection.getNodes({
						sort: true,
					})

					// Check if the dragged block is part of a multi-selection
					const isDraggedBlockSelected = selectedBlocks.some(
						([node]) => node.id === sourceId,
					)
					const hasMultipleSelections = selectedBlocks.length > 1

					// Find target block
					const targetEntry = editor.api.node({
						at: [],
						block: true,
						match: (n) => n.id === targetId,
					})

					if (!targetEntry) {
						return
					}

					const [, targetPath] = targetEntry

					// Determine target position based on drop zone
					const position = overData.position ?? "top"

					if (isDraggedBlockSelected && hasMultipleSelections) {
						// Multi-block drag and drop
						// Filter out any selected blocks that are descendants of other selected blocks
						const blocksToMove = selectedBlocks.filter(([, path]) => {
							return !selectedBlocks.some(
								([, otherPath]) =>
									otherPath !== path && PathApi.isDescendant(path, otherPath),
							)
						})

						if (blocksToMove.length === 0) {
							return
						}

						// Check if target is a descendant of any selected block
						const isTargetDescendant = blocksToMove.some(([, path]) =>
							PathApi.isDescendant(targetPath, path),
						)

						if (isTargetDescendant) {
							return
						}

						// Check if any selected block is the target itself
						const isTargetSelected = blocksToMove.some(
							([node]) => node.id === targetId,
						)

						if (isTargetSelected) {
							return
						}

						// Sort blocks by path to maintain order
						const sortedBlocks = [...blocksToMove].sort((a, b) => {
							const [, pathA] = a
							const [, pathB] = b
							return PathApi.compare(pathA, pathB)
						})

						// Save IDs before moving (to use after move)
						const idsToMove = sortedBlocks.map(([node]) => node.id as string)

						const firstSelectedPath = sortedBlocks[0]?.[1]
						const lastSelectedPath = sortedBlocks.at(-1)?.[1]

						// Prevent no-op drops that can still reorder the selection.
						// Example: selecting [B,C], dropping on D's top should be no-op.
						if (
							position === "top" &&
							lastSelectedPath &&
							PathApi.isSibling(lastSelectedPath, targetPath) &&
							PathApi.equals(PathApi.next(lastSelectedPath), targetPath)
						) {
							return
						}

						// Example: selecting [C,D], dropping on B's bottom should be no-op.
						if (
							position === "bottom" &&
							firstSelectedPath &&
							PathApi.isSibling(firstSelectedPath, targetPath) &&
							PathApi.equals(firstSelectedPath, PathApi.next(targetPath))
						) {
							return
						}

						editor.tf.withoutNormalizing(() => {
							const nodesToMove = sortedBlocks.map(([node]) => node)

							// Remove nodes from bottom to top so paths don't shift.
							for (const [, path] of [...sortedBlocks].reverse()) {
								editor.tf.removeNodes({ at: path })
							}

							// Re-resolve targetPath after removals (it may have shifted).
							const currentTargetEntry = editor.api.node({
								at: [],
								block: true,
								match: (n) => n.id === targetId,
							})

							if (!currentTargetEntry) return

							const [, currentTargetPath] = currentTargetEntry
							const insertAt =
								position === "top"
									? currentTargetPath
									: PathApi.next(currentTargetPath)

							editor.tf.insertNodes(nodesToMove as any, { at: insertAt })
						})

						// Update blockSelection with the IDs we moved (they're still valid after move)
						blockSelectionApi.blockSelection.set(idsToMove)
					} else {
						// Single block drag and drop (existing logic)
						// Find source block
						const sourceEntry = editor.api.node({
							at: [],
							block: true,
							match: (n) => n.id === sourceId,
						})

						if (!sourceEntry) {
							return
						}

						const [, sourcePath] = sourceEntry

						// Don't move if paths are the same
						if (PathApi.equals(sourcePath, targetPath)) {
							return
						}

						// Check if target is a descendant of source (prevent moving parent into child)
						// A path is a descendant if it starts with the parent path
						const isDescendant = PathApi.isDescendant(targetPath, sourcePath)

						if (isDescendant) {
							return
						}

						// Check if source and target are adjacent siblings (same parent, index differs by 1)
						const areAdjacentSiblings =
							PathApi.isSibling(sourcePath, targetPath) &&
							Math.abs((sourcePath.at(-1) ?? 0) - (targetPath.at(-1) ?? 0)) ===
								1

						// Prevent dropping to adjacent block's top/bottom if it would result in no effective movement
						if (areAdjacentSiblings) {
							const sourceIndex = sourcePath.at(-1) ?? 0
							const targetIndex = targetPath.at(-1) ?? 0

							// Prevent: source is immediately above target and dropping to target's top
							if (position === "top" && sourceIndex === targetIndex - 1) {
								return
							}

							// Prevent: source is immediately below target and dropping to target's bottom
							if (position === "bottom" && sourceIndex === targetIndex + 1) {
								return
							}
						}

						const areSiblings = PathApi.isSibling(sourcePath, targetPath)
						const isMovingDown =
							areSiblings && PathApi.isBefore(sourcePath, targetPath)

						// Slate/Plate moveNodes expects `to` to be the final path.
						// When moving a sibling downwards, the target index shifts after removal,
						// so we need to adjust the insertion path to preserve top/bottom semantics.
						let moveToPath = targetPath

						if (position === "top") {
							moveToPath = isMovingDown
								? (PathApi.previous(targetPath) ?? targetPath)
								: targetPath
						} else {
							moveToPath = isMovingDown ? targetPath : PathApi.next(targetPath)
						}

						// Move the source block to the determined position
						editor.tf.moveNodes({
							at: sourcePath,
							to: moveToPath,
						})

						// Set blockSelection on the moved block
						const movedEntry = editor.api.node({
							at: moveToPath,
							block: true,
						})
						if (movedEntry) {
							const [movedNode] = movedEntry
							if (movedNode.id) {
								blockSelectionApi.blockSelection.set(movedNode.id as string)
							}
						}
					}
				}
				return
			}

			const sourcePath = source.data?.path as string | undefined
			const dropZoneId = target?.id as string | undefined

			if (!sourcePath || !dropZoneId) {
				return
			}

			// Extract the destination path from the droppable zone id
			// Format is "droppable-{path}"
			const destinationPath = dropZoneId.replace("droppable-", "")

			if (!destinationPath || sourcePath === destinationPath) {
				return
			}

			// Check if the dragged item is part of a multi-selection
			const isSelected = selectedEntryPaths.has(sourcePath)
			const hasMultipleSelections = selectedEntryPaths.size > 1

			if (isSelected && hasMultipleSelections) {
				const selectedPaths = Array.from(selectedEntryPaths) as string[]
				// Only move top-level selections; drop descendants to preserve hierarchy
				const pathsToMove = selectedPaths.filter(
					(path: string) =>
						!selectedPaths.some(
							(otherPath: string) =>
								otherPath !== path && isPathEqualOrDescendant(path, otherPath),
						),
				)

				if (pathsToMove.length === 0) {
					return
				}

				const results = await Promise.allSettled(
					pathsToMove.map((path) => moveEntry(path, destinationPath)),
				)

				// Log any failures
				results.forEach((result, index) => {
					if (result.status === "rejected") {
						console.error(
							`Failed to move entry: ${pathsToMove[index]}`,
							result.reason,
						)
					} else if (result.value === false) {
						console.error(`Failed to move entry: ${pathsToMove[index]}`)
					}
				})
			} else {
				// Move only the dragged entry (single selection or not selected)
				const success = await moveEntry(sourcePath, destinationPath)

				if (!success) {
					console.error("Failed to move entry")
				}
			}

			// Reset selection after move
			resetSelection()
		},
		[moveEntry, selectedEntryPaths, resetSelection, collectImagePaths, editor],
	)

	return (
		<DragDropProvider sensors={sensors} onDragEnd={handleDragEnd}>
			{children}
			<DragOverlay>
				<div />
			</DragOverlay>
		</DragDropProvider>
	)
}
