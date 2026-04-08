import { KEYS, type Value } from "platejs"
import { describe, expect, it, vi } from "vitest"
import * as frontmatterFocus from "../frontmatter/frontmatter-focus"
import {
	createNoteTitleBlock,
	createNoteTitlePlugin,
	getEditorTitleText,
	injectEditorTitleBlock,
	NOTE_TITLE_KEY,
	normalizeEditorTitleText,
	stripEditorTitleBlock,
} from "./note-title-kit"

describe("note-title-kit", () => {
	it("injects a title block from the current file name", () => {
		const value = injectEditorTitleBlock("/workspace/My Note.md", [
			{
				type: KEYS.p,
				children: [{ text: "Body" }],
			},
		] as Value)

		expect(value[0]).toEqual(createNoteTitleBlock("My Note"))
		expect(value[1]).toMatchObject({
			type: KEYS.p,
			children: [{ text: "Body" }],
		})
	})

	it("keeps frontmatter after the editor-only title block", () => {
		const value = injectEditorTitleBlock("/workspace/note.md", [
			{
				type: "frontmatter",
				children: [{ text: "" }],
			},
		] as Value)

		expect(value[0]).toMatchObject({ type: NOTE_TITLE_KEY })
		expect(value[1]).toMatchObject({ type: "frontmatter" })
	})

	it("adds an empty paragraph when a note has no persisted body", () => {
		const value = injectEditorTitleBlock("/workspace/Empty.md", [] as Value)

		expect(value[0]).toMatchObject({ type: NOTE_TITLE_KEY })
		expect(value[1]).toMatchObject({
			type: KEYS.p,
			children: [{ text: "" }],
		})
	})

	it("strips editor-only title blocks before persistence", () => {
		const value = stripEditorTitleBlock([
			createNoteTitleBlock("Title"),
			{
				type: KEYS.p,
				children: [{ text: "Body" }],
			},
		] as Value)

		expect(value).toEqual([
			{
				type: KEYS.p,
				children: [{ text: "Body" }],
			},
		])
	})

	it("returns the title block text", () => {
		expect(
			getEditorTitleText([
				createNoteTitleBlock("Title"),
				{
					type: KEYS.p,
					children: [{ text: "Body" }],
				},
			] as Value),
		).toBe("Title")
	})

	it("normalizes forbidden filename characters from title text", () => {
		expect(normalizeEditorTitleText('  Hello:/\\"*?<>|\nWorld\t')).toBe(
			"Hello World",
		)
	})

	it("strips marks from title children on change", () => {
		const plugin = createNoteTitlePlugin()
		const replaceNodes = vi.fn()
		const editor = {
			children: [
				{
					type: NOTE_TITLE_KEY,
					children: [{ text: "Title", bold: true, italic: true }],
				},
			],
			api: {
				node: vi.fn().mockReturnValue(true),
			},
			tf: {
				insertNodes: vi.fn(),
				replaceNodes,
			},
		} as any

		plugin.handlers.onChange?.({ editor } as any)

		expect(replaceNodes).toHaveBeenCalledWith(createNoteTitleBlock("Title"), {
			at: [0],
		})
	})

	it("short-circuits title paste when another handler already prevented it", () => {
		const plugin = createNoteTitlePlugin()
		const insertText = vi.fn()
		const event = {
			defaultPrevented: true,
		} as any
		const editor = {
			api: {
				block: vi.fn(),
			},
			tf: {
				insertText,
			},
		} as any

		const result = plugin.handlers.onPaste?.({ editor, event } as any)

		expect(result).toBe(true)
		expect(editor.api.block).not.toHaveBeenCalled()
		expect(insertText).not.toHaveBeenCalled()
	})

	it("returns handled after applying title paste text", () => {
		const plugin = createNoteTitlePlugin()
		const insertText = vi.fn()
		const preventDefault = vi.fn()
		const stopPropagation = vi.fn()
		const editor = {
			api: {
				block: vi.fn().mockReturnValue([{ type: NOTE_TITLE_KEY }, [0]]),
			},
			tf: {
				insertText,
			},
		} as any
		const event = {
			defaultPrevented: false,
			clipboardData: {
				getData: vi.fn().mockReturnValue("Hello"),
			},
			preventDefault,
			stopPropagation,
		} as any

		const result = plugin.handlers.onPaste?.({ editor, event } as any)

		expect(result).toBe(true)
		expect(preventDefault).toHaveBeenCalledTimes(1)
		expect(stopPropagation).toHaveBeenCalledTimes(1)
		expect(insertText).toHaveBeenCalledWith("Hello")
	})

	it("blocks mark hotkeys inside the title", () => {
		const plugin = createNoteTitlePlugin()
		const preventDefault = vi.fn()
		const stopPropagation = vi.fn()
		const editor = {
			api: {
				block: vi.fn().mockReturnValue([{ type: NOTE_TITLE_KEY }, [0]]),
			},
		} as any
		const event = {
			key: "b",
			metaKey: true,
			ctrlKey: false,
			altKey: false,
			preventDefault,
			stopPropagation,
		} as any

		plugin.handlers.onKeyDown?.({ editor, event } as any)

		expect(preventDefault).toHaveBeenCalledTimes(1)
		expect(stopPropagation).toHaveBeenCalledTimes(1)
	})

	it("moves focus to the frontmatter when pressing arrow down in the title", () => {
		const preventDefault = vi.fn()
		const stopPropagation = vi.fn()
		const onExitTitle = vi.fn()
		const requestFrontmatterFocusSpy = vi.spyOn(
			frontmatterFocus,
			"requestFrontmatterFocus",
		)
		const editor = {
			id: "editor-1",
			children: [
				{ type: NOTE_TITLE_KEY, children: [{ text: "Title" }] },
				{ type: "frontmatter", children: [{ text: "" }] },
				{ type: KEYS.p, children: [{ text: "" }] },
			],
			api: {
				block: vi.fn().mockReturnValue([{ type: NOTE_TITLE_KEY }, [0]]),
			},
		} as any
		const event = {
			key: "ArrowDown",
			preventDefault,
			stopPropagation,
		} as any

		createNoteTitlePlugin({ onExitTitle }).handlers.onKeyDown?.({
			editor,
			event,
		} as any)

		expect(preventDefault).toHaveBeenCalledTimes(1)
		expect(stopPropagation).toHaveBeenCalledTimes(1)
		expect(requestFrontmatterFocusSpy).toHaveBeenCalledWith(
			"editor-1",
			"firstCell",
		)
		expect(onExitTitle).toHaveBeenCalledTimes(1)

		requestFrontmatterFocusSpy.mockRestore()
	})
})
