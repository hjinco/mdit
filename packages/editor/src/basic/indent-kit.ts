import { IndentPlugin } from "@platejs/indent/react"
import { KEYS } from "platejs"

export const IndentKit = [
	IndentPlugin.configure({
		inject: {
			targetPlugins: [KEYS.p],
		},
		options: {
			offset: 24,
		},
		shortcuts: {
			backspace: {
				keys: "backspace",
				handler: ({ editor, event }) => {
					// Allow default behavior during IME composition
					if (event.isComposing) {
						return false
					}

					// Check if cursor is at the start of the block
					if (!editor.api.isAt({ start: true })) {
						return false // Allow default behavior
					}

					// Get current block node
					const entry = editor.api.above({
						match: editor.api.isBlock,
						mode: "highest",
					})

					if (!entry) {
						return false // Allow default behavior
					}

					const [node, path] = entry

					// Allow default behavior in codeblock
					if (node.type === editor.getType(KEYS.codeBlock)) {
						return false
					}

					// Check indent property
					const indent = (node as { indent?: number }).indent

					// Only process if indent exists and is greater than 0
					if (indent === undefined || indent === 0) {
						return false // Allow default behavior
					}

					// Check if it's a list block (has listStyleType)
					const listStyleType = (node as { listStyleType?: string })
						.listStyleType

					if (listStyleType) {
						const selection = editor.selection
						// When text is selected in a list block and backspace is pressed,
						// delete the selected text first instead of removing listStyleType.
						// This prevents the list formatting from being removed when the user
						// intends to delete selected content.
						if (selection?.anchor && selection?.focus) {
							const anchor = selection.anchor
							const focus = selection.focus
							// Check if there's an actual selection (anchor and focus are different)
							const hasSelection =
								anchor.path.join(",") !== focus.path.join(",") ||
								anchor.offset !== focus.offset

							if (hasSelection) {
								// Delete the selected text and prevent default behavior
								editor.tf.delete({
									at: { anchor, focus },
								})
								return true
							}
						}
						// Convert list block to paragraph
						editor.tf.setNodes(
							{
								type: editor.getType(KEYS.p),
								indent: indent > 1 ? indent - 1 : undefined,
								checked: indent === 1 ? undefined : node.checked,
							},
							{ at: path },
						)
						editor.tf.unsetNodes("listStyleType", { at: path })
						return true // Prevent default behavior
					}

					// If it's already a paragraph, outdent
					if (node.type === editor.getType(KEYS.p)) {
						const newIndent = indent - 1
						if (newIndent > 0) {
							editor.tf.setNodes({ indent: newIndent }, { at: path })
						} else {
							// Remove indent property if it becomes 0
							editor.tf.unsetNodes("indent", { at: path })
						}
						return true // Prevent default behavior
					}

					// Allow default behavior for other block types
					return false
				},
			},
		},
	}).overrideEditor(({ editor, tf: { tab } }) => ({
		transforms: {
			tab: (options) => {
				const entry = editor.api.above({
					match: editor.api.isBlock,
					mode: "highest",
				})

				if (!entry) {
					return tab(options)
				}

				const [node, path] = entry

				if (node.type === editor.getType(KEYS.codeBlock)) {
					return tab(options)
				}

				if (options?.reverse) {
					const currentIndent = (node as { indent?: number }).indent ?? 0

					if (currentIndent <= 1) {
						return true
					}

					// Collect all child blocks that need to be outdented with the parent.
					const childBlocks: Array<{ path: typeof path; newIndent: number }> =
						[]
					let currentPath = path

					while (true) {
						const nextEntry = editor.api.next({
							at: currentPath,
							match: editor.api.isBlock,
							mode: "highest",
						})

						if (!nextEntry) {
							break
						}

						const [nextNode, nextPath] = nextEntry
						const nextIndent = (nextNode as { indent?: number }).indent ?? 0

						if (nextIndent <= currentIndent) {
							break
						}

						childBlocks.push({ path: nextPath, newIndent: nextIndent - 1 })
						currentPath = nextPath
					}

					editor.tf.withoutNormalizing(() => {
						editor.tf.setNodes({ indent: currentIndent - 1 }, { at: path })

						for (const { path: childPath, newIndent } of childBlocks) {
							editor.tf.setNodes({ indent: newIndent }, { at: childPath })
						}
					})

					return true
				}

				const currentIndent = (node as { indent?: number }).indent ?? 0
				const previousEntry = editor.api.previous({
					at: path,
					match: editor.api.isBlock,
					mode: "highest",
				})
				const previousIndent =
					previousEntry && (previousEntry[0] as { indent?: number }).indent
						? (previousEntry[0] as { indent?: number }).indent!
						: 0
				const newIndent =
					currentIndent < previousIndent
						? currentIndent + 1
						: previousIndent + 1

				editor.tf.setNodes({ indent: newIndent }, { at: path })

				return true
			},
		},
	})),
]
