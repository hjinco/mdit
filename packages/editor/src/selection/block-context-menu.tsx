import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@mdit/ui/components/context-menu"
import { AIChatPlugin } from "@platejs/ai/react"
import {
	BLOCK_CONTEXT_MENU_ID,
	BlockMenuPlugin,
	BlockSelectionPlugin,
} from "@platejs/selection/react"
import { IconTransform } from "@tabler/icons-react"
import {
	CopyIcon,
	Heading1Icon,
	Heading2Icon,
	Heading3Icon,
	LinkIcon,
	ListIcon,
	ListOrdered,
	Quote,
	SparklesIcon,
	Square,
	Trash2Icon,
	TypeIcon,
} from "lucide-react"
import { KEYS, type Path } from "platejs"
import { useEditorPlugin, usePlateState, usePluginOption } from "platejs/react"
import { useCallback, useMemo, useRef, useState } from "react"
import { exitLinkForwardAtSelection } from "../link/link-exit"
import { isBlockDragHandleContextMenuId } from "../selection/block-menu-ids"
import {
	type BlockSelectionNodeEntry,
	buildLinkedNoteNode,
	type CreateLinkedNotesFromListItemsHandler,
	getListSelectionNodes,
} from "../selection/block-selection-linked-notes"
import { useIsTouchDevice } from "../shared/use-is-touch-device"
import { restoreFocusAfterBlockRemoval } from "./block-selection-delete"

type Value = "askAI" | null

export function isNoteTitleContextMenuTarget(
	target: EventTarget | null,
): boolean {
	if (
		!target ||
		typeof target !== "object" ||
		!("closest" in target) ||
		typeof target.closest !== "function"
	) {
		return false
	}

	return Boolean(target.closest("[data-note-title-block='true']"))
}

export function BlockContextMenu({
	children,
	onCreateLinkedNotesFromListItems,
}: {
	children: React.ReactNode
	onCreateLinkedNotesFromListItems?: CreateLinkedNotesFromListItemsHandler
}) {
	const { api, editor } = useEditorPlugin(BlockMenuPlugin)
	const [value, setValue] = useState<Value>(null)
	const isCreatingLinkedNotesRef = useRef(false)
	const skipNextCloseAutoFocusRef = useRef(false)
	const isTouch = useIsTouchDevice()
	const [readOnly] = usePlateState("readOnly")
	const openId = usePluginOption(BlockMenuPlugin, "openId")
	const position = usePluginOption(BlockMenuPlugin, "position")
	const selectedIds = usePluginOption(BlockSelectionPlugin, "selectedIds")
	const isHandleContextMenu = isBlockDragHandleContextMenuId(openId)
	const isOpen = openId === BLOCK_CONTEXT_MENU_ID || isHandleContextMenu

	const anchor = useMemo(() => {
		return {
			getBoundingClientRect: () =>
				DOMRect.fromRect({
					width: 0,
					height: 0,
					x: position.x,
					y: position.y,
				}),
		}
	}, [position.x, position.y])

	const handleTurnInto = useCallback(
		(type: string) => {
			const isListType = [KEYS.ul, KEYS.ol, KEYS.listTodo].includes(type as any)

			editor.tf.withoutNormalizing(() => {
				for (const [node, path] of editor
					.getApi(BlockSelectionPlugin)
					.blockSelection.getNodes()) {
					if (node[KEYS.listType]) {
						editor.tf.unsetNodes([KEYS.listType, "indent"], {
							at: path,
						})
					}

					if (isListType) {
						editor.tf.setNodes(
							{
								indent: 1,
								listStyleType: type,
								...(type === KEYS.listTodo && { checked: false }),
							},
							{ at: path },
						)
					} else {
						editor.tf.toggleBlock(type, { at: path })
					}
				}
			})
		},
		[editor],
	)

	const selectedNodes = useMemo(() => {
		void selectedIds
		return editor
			.getApi(BlockSelectionPlugin)
			.blockSelection.getNodes() as BlockSelectionNodeEntry[]
	}, [editor, selectedIds])

	const selectedListNodes = useMemo(() => {
		return getListSelectionNodes(selectedNodes)
	}, [selectedNodes])

	const canCreateLinkedNotes = useMemo(() => {
		if (!onCreateLinkedNotesFromListItems || readOnly) {
			return false
		}

		return selectedListNodes !== null
	}, [onCreateLinkedNotesFromListItems, readOnly, selectedListNodes])

	const createLinkedNotesLabel = useMemo(() => {
		if (!selectedListNodes) {
			return "Link notes"
		}

		return selectedListNodes.length === 1 ? "Link note" : "Link notes"
	}, [selectedListNodes])

	const handleCreateLinkedNotes = useCallback(async () => {
		if (!onCreateLinkedNotesFromListItems || readOnly) {
			return
		}

		if (!selectedListNodes) {
			return
		}
		const selectionNodes = selectedListNodes

		const listItemTexts = selectionNodes.map(([, path]) =>
			editor.api.string(path).trim(),
		)

		try {
			isCreatingLinkedNotesRef.current = true
			skipNextCloseAutoFocusRef.current = true

			const results = await onCreateLinkedNotesFromListItems(listItemTexts)
			const linkType = editor.getType(KEYS.link)
			let lastSuccessfulPath: Path | null = null

			editor.tf.withoutNormalizing(() => {
				for (const [index, [node, path]] of selectionNodes.entries()) {
					const result = results[index]
					if (!result) continue

					const nextNode = buildLinkedNoteNode({
						node: node as Record<string, unknown>,
						linkType,
						wikiTarget: result.wikiTarget,
						linkText: result.linkText,
						fallbackText: listItemTexts[index] ?? "",
					})
					if (!nextNode) continue

					editor.tf.replaceNodes(nextNode as any, { at: path })
					lastSuccessfulPath = path
				}
			})

			if (!lastSuccessfulPath) {
				editor.getApi(BlockSelectionPlugin).blockSelection.focus()
				return
			}

			const pathToFocus = [...lastSuccessfulPath] as Path
			editor.getApi(BlockSelectionPlugin).blockSelection.deselect()
			setTimeout(() => {
				editor.meta._forceFocus = true
				try {
					const linkEntry = editor.api.node({
						at: pathToFocus,
						match: { type: linkType },
					})

					if (linkEntry) {
						const [, linkPath] = linkEntry
						const linkEnd = editor.api.end(linkPath)
						if (linkEnd) {
							editor.tf.select({ anchor: linkEnd, focus: linkEnd })
						}

						const didExit = exitLinkForwardAtSelection(editor, {
							allowFromInsideLink: true,
							focusEditor: false,
							markArrowRightExit: true,
						})

						if (!didExit) {
							const fallbackEnd = editor.api.end(pathToFocus)
							if (fallbackEnd) {
								editor.tf.select({
									anchor: fallbackEnd,
									focus: fallbackEnd,
								})
							}
						}
					} else {
						const end = editor.api.end(pathToFocus)
						if (end) {
							editor.tf.select({ anchor: end, focus: end })
						}
					}

					editor.tf.focus()
				} finally {
					editor.meta._forceFocus = undefined
				}
			}, 0)
		} finally {
			isCreatingLinkedNotesRef.current = false
		}
	}, [editor, onCreateLinkedNotesFromListItems, readOnly, selectedListNodes])

	const turnIntoItems = [
		{ key: KEYS.p, icon: TypeIcon, label: "Paragraph" },
		{ key: KEYS.h1, icon: Heading1Icon, label: "Heading 1" },
		{ key: KEYS.h2, icon: Heading2Icon, label: "Heading 2" },
		{ key: KEYS.h3, icon: Heading3Icon, label: "Heading 3" },
		{ key: KEYS.blockquote, icon: Quote, label: "Blockquote" },
		{ key: KEYS.ul, icon: ListIcon, label: "Bulleted list" },
		{ key: KEYS.ol, icon: ListOrdered, label: "Numbered list" },
		{ key: KEYS.listTodo, icon: Square, label: "Todo list" },
	]

	if (isTouch) {
		return children
	}

	return (
		<ContextMenu
			open={isOpen}
			onOpenChange={(open) => {
				if (open) return

				// prevent unselect the block selection
				setTimeout(() => {
					api.blockMenu.hide()
				}, 0)
			}}
		>
			<ContextMenuTrigger
				asChild
				onContextMenuCapture={(event) => {
					// Plate block-selection prevents bubbling on focused blocks unless
					// the event target is explicitly marked as context-menu-allowed.
					const target = event.target
					if (isNoteTitleContextMenuTarget(target)) return
					if (!(target instanceof HTMLElement)) return
					if (target.dataset.plateOpenContextMenu !== undefined) return

					target.dataset.plateOpenContextMenu = "true"
					setTimeout(() => {
						delete target.dataset.plateOpenContextMenu
					}, 0)
				}}
				onContextMenu={(event) => {
					if (isNoteTitleContextMenuTarget(event.target)) return

					const dataset = (event.target as HTMLElement).dataset
					const disabled =
						dataset?.slateEditor === "true" ||
						readOnly ||
						dataset?.plateOpenContextMenu === "false"

					if (disabled) return event.preventDefault()

					api.blockMenu.show(BLOCK_CONTEXT_MENU_ID, {
						x: event.clientX,
						y: event.clientY,
					})
				}}
			>
				<div>{children}</div>
			</ContextMenuTrigger>
			<ContextMenuContent
				anchor={anchor}
				align={isHandleContextMenu ? "center" : "start"}
				className="w-64"
				side={isHandleContextMenu ? "left" : "bottom"}
				finalFocus={() => {
					if (skipNextCloseAutoFocusRef.current) {
						skipNextCloseAutoFocusRef.current = false
					} else if (!isCreatingLinkedNotesRef.current) {
						editor.getApi(BlockSelectionPlugin).blockSelection.focus()
					}

					if (value === "askAI") {
						editor.getApi(AIChatPlugin).aiChat.show()
					}

					setValue(null)
					return false
				}}
			>
				<ContextMenuGroup>
					<ContextMenuItem
						onClick={() => {
							setValue("askAI")
						}}
					>
						<SparklesIcon /> Ask AI
						<ContextMenuShortcut>⌘J</ContextMenuShortcut>
					</ContextMenuItem>
					<ContextMenuItem
						onClick={() => {
							editor
								.getTransforms(BlockSelectionPlugin)
								.blockSelection.duplicate()
						}}
					>
						<CopyIcon /> Duplicate
						<ContextMenuShortcut>⌘D</ContextMenuShortcut>
					</ContextMenuItem>
					<ContextMenuItem
						onClick={() => {
							const firstPath = editor
								.getApi(BlockSelectionPlugin)
								.blockSelection.getNodes({ sort: true })[0]?.[1]

							skipNextCloseAutoFocusRef.current = true
							editor
								.getTransforms(BlockSelectionPlugin)
								.blockSelection.removeNodes()
							editor.getApi(BlockSelectionPlugin).blockSelection.deselect()

							if (firstPath) {
								setTimeout(() => {
									restoreFocusAfterBlockRemoval(editor, firstPath)
								}, 0)
							}
						}}
					>
						<Trash2Icon /> Delete
						<ContextMenuShortcut>Del</ContextMenuShortcut>
					</ContextMenuItem>
					<ContextMenuSeparator />
					{canCreateLinkedNotes && (
						<ContextMenuItem
							onClick={() => {
								void handleCreateLinkedNotes()
							}}
						>
							<LinkIcon />
							{createLinkedNotesLabel}
						</ContextMenuItem>
					)}
					<ContextMenuSub>
						<ContextMenuSubTrigger>
							<IconTransform />
							Turn into
						</ContextMenuSubTrigger>
						<ContextMenuSubContent className="w-48">
							{turnIntoItems.map(({ key, icon: Icon, label }) => (
								<ContextMenuItem key={key} onClick={() => handleTurnInto(key)}>
									<Icon /> {label}
								</ContextMenuItem>
							))}
						</ContextMenuSubContent>
					</ContextMenuSub>
				</ContextMenuGroup>
			</ContextMenuContent>
		</ContextMenu>
	)
}
