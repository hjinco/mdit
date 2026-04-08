import { KEYS, type Value } from "platejs"
import {
	createPlatePlugin,
	type PlateEditor,
	type PlateElementProps,
} from "platejs/react"
import {
	type CompositionEvent,
	type FormEvent,
	useCallback,
	useEffect,
	useState,
} from "react"
import { HeadingElement } from "../basic/node-heading"
import { requestFrontmatterFocus } from "../frontmatter/frontmatter-focus"

const FRONTMATTER_KEY = "frontmatter"
const NOTE_TITLE_INVALID_CHAR_REGEX = /[/\\:*?"<>|]/
const NOTE_TITLE_INVALID_CHARS_GLOBAL_REGEX = /[/\\:*?"<>|]/g
const NOTE_TITLE_BLOCKED_HOTKEY_REGEX = /^[1-6]$/
const NOTE_TITLE_WHITESPACE_REGEX = /[\r\n\t]+/g
const NOTE_TITLE_DOM_HIDDEN_TEXT_REGEX = /[\u200B\uFEFF\r\n\t]/g
const NOTE_TITLE_PLACEHOLDER = "Untitled"

export const NOTE_TITLE_KEY = "note_title"

type NoteTitlePluginOptions = {
	onInvalidInput?: () => void
	onExitTitle?: () => void
}

type NoteTitleElementNode = {
	type: typeof NOTE_TITLE_KEY
	children: Array<{ text: string }>
}

const NOTE_TITLE_MARK_HOTKEYS = new Set(["b", "i", "u", "e", ",", ".", "x"])

function getFileNameStem(path: string): string {
	const normalizedPath = path.replace(/\\/g, "/")
	const fileName = normalizedPath.split("/").at(-1) ?? normalizedPath
	const lastDotIndex = fileName.lastIndexOf(".")
	return lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName
}

export function normalizeEditorTitleText(text: string): string {
	return text
		.replace(NOTE_TITLE_WHITESPACE_REGEX, " ")
		.replace(NOTE_TITLE_INVALID_CHARS_GLOBAL_REGEX, "")
		.trim()
}

export function createNoteTitleBlock(text: string): NoteTitleElementNode {
	return {
		type: NOTE_TITLE_KEY,
		children: [{ text: normalizeEditorTitleText(text) }],
	}
}

export function isNoteTitleNode(node: unknown): node is NoteTitleElementNode {
	return (
		typeof node === "object" &&
		node !== null &&
		"type" in node &&
		(node as { type?: string }).type === NOTE_TITLE_KEY
	)
}

export function stripEditorTitleBlock(value: Value): Value {
	if (!Array.isArray(value)) {
		return []
	}

	return value.filter((node) => !isNoteTitleNode(node)) as Value
}

export function injectEditorTitleBlock(path: string, value: Value): Value {
	const strippedValue = stripEditorTitleBlock(value)
	const nextValue = [
		createNoteTitleBlock(getFileNameStem(path)),
		...strippedValue,
	]

	if (nextValue.length === 1) {
		nextValue.push({
			type: KEYS.p,
			children: [{ text: "" }],
		} as any)
	}

	return nextValue as Value
}

export function getEditorTitleText(value: Value): string {
	if (!Array.isArray(value)) {
		return ""
	}

	const titleNode = value.find(isNoteTitleNode)
	if (!titleNode) {
		return ""
	}

	return titleNode.children.map((child) => child.text ?? "").join("")
}

function hasNonPlainTitleChildren(node: NoteTitleElementNode) {
	return node.children.some((child) => {
		const keys = Object.keys(child)
		return keys.length !== 1 || keys[0] !== "text"
	})
}

function isNoteTitleEmpty(node: NoteTitleElementNode) {
	return node.children.every((child) => !child.text?.trim())
}

function hasVisibleTitleDomText(element: HTMLElement | null) {
	if (!element) {
		return false
	}

	return (
		(element.textContent?.replace(NOTE_TITLE_DOM_HIDDEN_TEXT_REGEX, "").trim()
			.length ?? 0) > 0
	)
}

function replaceEditorTitleText(
	editor: Pick<PlateEditor, "api" | "tf">,
	text: string,
) {
	const nextTitle = createNoteTitleBlock(text)
	const existingTitle = editor.api.node([0])

	if (existingTitle) {
		editor.tf.replaceNodes(nextTitle, { at: [0] })
		return
	}

	editor.tf.insertNodes(nextTitle, { at: [0] })
}

function isSelectionInTitle(editor: PlateEditor) {
	const blockEntry = editor.api.block()
	if (!blockEntry) {
		return false
	}

	const [node, path] = blockEntry
	return path.length === 1 && path[0] === 0 && node.type === NOTE_TITLE_KEY
}

function getBodyStartPath(editor: PlateEditor): [number] {
	return editor.children[1]?.type === FRONTMATTER_KEY ? [2] : [1]
}

function focusNextBlockFromTitle(editor: PlateEditor) {
	if (editor.children[1]?.type === FRONTMATTER_KEY) {
		requestFrontmatterFocus(editor.id, "firstCell")
		return
	}

	focusOrCreateBodyBlock(editor)
}

function focusOrCreateBodyBlock(editor: PlateEditor) {
	const bodyPath = getBodyStartPath(editor)
	const bodyEntry = editor.api.node(bodyPath)

	if (bodyEntry) {
		const start = editor.api.start(bodyPath)
		if (start) {
			editor.tf.select(start)
			editor.tf.focus()
		}
		return
	}

	editor.tf.insertNodes(editor.api.create.block({ type: KEYS.p }), {
		at: bodyPath,
		select: true,
	})
}

function sanitizeTitleNodeIfNeeded(
	editor: Pick<PlateEditor, "children" | "api" | "tf">,
	onInvalidInput?: () => void,
) {
	const titleNode = editor.children[0]
	if (!isNoteTitleNode(titleNode)) {
		return
	}

	const currentText = getEditorTitleText(editor.children as Value)
	const nextText = normalizeEditorTitleText(currentText)

	if (currentText === nextText && !hasNonPlainTitleChildren(titleNode)) {
		return
	}

	replaceEditorTitleText(editor, nextText)
	onInvalidInput?.()
}

function NoteTitleElement(props: PlateElementProps) {
	const [element, setElement] = useState<HTMLElement | null>(null)
	const [hasDomText, setHasDomText] = useState(false)
	const isEmpty =
		isNoteTitleNode(props.element) && isNoteTitleEmpty(props.element)
	const isComposing = props.editor.api.isComposing()
	const syncDomText = useCallback(
		(nextElement?: HTMLElement | null) => {
			setHasDomText(hasVisibleTitleDomText(nextElement ?? element))
		},
		[element],
	)

	useEffect(() => {
		syncDomText(element)
		if (!element) {
			return
		}

		const observer = new MutationObserver(() => {
			syncDomText(element)
		})

		observer.observe(element, {
			characterData: true,
			childList: true,
			subtree: true,
		})

		return () => {
			observer.disconnect()
		}
	}, [element, syncDomText])

	const titlePlaceholderClassName =
		isEmpty && !isComposing && !hasDomText
			? "before:pointer-events-none before:absolute before:top-0 before:left-0 before:text-muted-foreground/55 before:content-[attr(data-note-title-placeholder)]"
			: undefined

	return (
		<HeadingElement
			variant="h1"
			{...props}
			attributes={{
				...props.attributes,
				className: [props.attributes.className, titlePlaceholderClassName]
					.filter(Boolean)
					.join(" "),
				"data-note-title-block": "true",
				"data-note-title-placeholder": NOTE_TITLE_PLACEHOLDER,
				ref: (node: HTMLElement | null) => {
					if (typeof props.attributes.ref === "function") {
						props.attributes.ref(node)
					} else if (props.attributes.ref) {
						props.attributes.ref.current = node
					}
					setElement(node)
					syncDomText(node)
				},
				onBeforeInput: (event: FormEvent<HTMLElement>) => {
					if (typeof props.attributes.onBeforeInput === "function") {
						props.attributes.onBeforeInput(event)
					}
					syncDomText(event.currentTarget as HTMLElement)
				},
				onInput: (event: FormEvent<HTMLElement>) => {
					if (typeof props.attributes.onInput === "function") {
						props.attributes.onInput(event)
					}
					syncDomText(event.currentTarget as HTMLElement)
				},
				onCompositionStart: (event: CompositionEvent<HTMLElement>) => {
					if (typeof props.attributes.onCompositionStart === "function") {
						props.attributes.onCompositionStart(event)
					}
					syncDomText(event.currentTarget as HTMLElement)
				},
				onCompositionUpdate: (event: CompositionEvent<HTMLElement>) => {
					if (typeof props.attributes.onCompositionUpdate === "function") {
						props.attributes.onCompositionUpdate(event)
					}
					syncDomText(event.currentTarget as HTMLElement)
				},
				onCompositionEnd: (event: CompositionEvent<HTMLElement>) => {
					if (typeof props.attributes.onCompositionEnd === "function") {
						props.attributes.onCompositionEnd(event)
					}
					syncDomText(event.currentTarget as HTMLElement)
				},
			}}
		/>
	)
}

export function createNoteTitlePlugin({
	onInvalidInput,
	onExitTitle,
}: NoteTitlePluginOptions = {}) {
	return createPlatePlugin({
		key: NOTE_TITLE_KEY,
		node: {
			component: NoteTitleElement,
			isElement: true,
		},
		handlers: {
			onChange: ({ editor }) => {
				if (!isNoteTitleNode(editor.children[0])) {
					editor.tf.insertNodes(createNoteTitleBlock(""), { at: [0] })
					return
				}

				sanitizeTitleNodeIfNeeded(editor, onInvalidInput)
			},
			onKeyDown: ({ editor, event }) => {
				if (!isSelectionInTitle(editor)) {
					return
				}

				if (event.key === "Enter") {
					event.preventDefault()
					event.stopPropagation()
					focusOrCreateBodyBlock(editor)
					onExitTitle?.()
					return
				}

				if (
					event.key === "Backspace" &&
					!getEditorTitleText(editor.children as Value)
				) {
					event.preventDefault()
					event.stopPropagation()
					return
				}

				if (event.key === "ArrowDown") {
					event.preventDefault()
					event.stopPropagation()
					focusNextBlockFromTitle(editor)
					onExitTitle?.()
					return
				}

				if (event.key === "Tab") {
					onExitTitle?.()
				}

				if (
					(event.metaKey || event.ctrlKey) &&
					event.altKey &&
					NOTE_TITLE_BLOCKED_HOTKEY_REGEX.test(event.key)
				) {
					event.preventDefault()
					event.stopPropagation()
					return
				}

				if (
					(event.metaKey || event.ctrlKey) &&
					NOTE_TITLE_MARK_HOTKEYS.has(event.key.toLowerCase())
				) {
					event.preventDefault()
					event.stopPropagation()
					return
				}

				if (
					!event.metaKey &&
					!event.ctrlKey &&
					!event.altKey &&
					event.key.length === 1 &&
					NOTE_TITLE_INVALID_CHAR_REGEX.test(event.key)
				) {
					event.preventDefault()
					event.stopPropagation()
					onInvalidInput?.()
				}
			},
			onPaste: ({ editor, event }) => {
				if (event.defaultPrevented) {
					return true
				}

				if (!isSelectionInTitle(editor)) {
					return
				}

				const pastedText = event.clipboardData.getData("text/plain")
				if (!pastedText) {
					return
				}

				const nextText = normalizeEditorTitleText(pastedText)
				event.preventDefault()
				event.stopPropagation()

				if (nextText.length > 0) {
					editor.tf.insertText(nextText)
				}

				if (nextText !== pastedText) {
					onInvalidInput?.()
				}

				return true
			},
		},
	})
}

export function createNoteTitleKit(options: NoteTitlePluginOptions = {}) {
	return [createNoteTitlePlugin(options)]
}
