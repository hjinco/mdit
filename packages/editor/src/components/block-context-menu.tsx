import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
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
import { useIsTouchDevice } from "../hooks/use-is-touch-device"
import {
	type BlockSelectionNodeEntry,
	buildLinkedNoteNode,
	type CreateLinkedNotesFromListItemsHandler,
	getListSelectionNodes,
} from "../plugins/block-selection-linked-notes"
import { exitLinkForwardAtSelection } from "../utils/link-exit"

type Value = "askAI" | null

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
	const selectedIds = usePluginOption(BlockSelectionPlugin, "selectedIds")

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
			onOpenChange={(open) => {
				if (!open) {
					// prevent unselect the block selection
					setTimeout(() => {
						api.blockMenu.hide()
					}, 0)
				}
			}}
		>
			<ContextMenuTrigger
				asChild
				onContextMenu={(event) => {
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
				className="w-64"
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
					</ContextMenuItem>
					<ContextMenuItem
						onClick={() => {
							editor
								.getTransforms(BlockSelectionPlugin)
								.blockSelection.removeNodes()
							editor.tf.focus()
						}}
					>
						<Trash2Icon /> Delete
					</ContextMenuItem>
					<ContextMenuItem
						onClick={() => {
							editor
								.getTransforms(BlockSelectionPlugin)
								.blockSelection.duplicate()
						}}
					>
						<CopyIcon /> Duplicate
						{/* <ContextMenuShortcut>⌘ + D</ContextMenuShortcut> */}
					</ContextMenuItem>
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
						<ContextMenuSubTrigger>Turn into</ContextMenuSubTrigger>
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
