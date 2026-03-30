import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { EditorStory } from "./editor-story-harness"

const meta = {
	component: EditorStory,
	tags: ["test"],
	title: "Editor/Slash",
} satisfies Meta<typeof EditorStory>

export default meta

type Story = StoryObj<typeof meta>

function getEditable(canvasElement: HTMLElement): HTMLElement {
	const editable = canvasElement.querySelector(
		'[data-testid="editor-story"] [contenteditable="true"]',
	)

	if (!(editable instanceof HTMLElement)) {
		throw new Error("Editor contenteditable element not found")
	}

	return editable
}

function getMarkdownValue(canvasElement: HTMLElement): string {
	const output = canvasElement.querySelector('[data-testid="markdown-output"]')

	if (!(output instanceof HTMLTextAreaElement)) {
		throw new Error("Markdown output textarea not found")
	}

	return output.value
}

export const EmptyDocument: Story = {
	args: {
		title: "Slash Menu",
		description:
			"Empty editor state for slash-command UI checks and Playwright coverage.",
		initialMarkdown: "",
	},
}

export const TypingSyncsMarkdown: Story = {
	args: EmptyDocument.args,
	play: async ({ canvasElement }) => {
		const editor = getEditable(canvasElement)

		await userEvent.click(editor)
		await userEvent.keyboard("hello from storybook")

		expect(getMarkdownValue(canvasElement)).toContain("hello from storybook")
	},
}

export const InsertHeadingFromSlashMenu: Story = {
	args: EmptyDocument.args,
	play: async ({ canvasElement }) => {
		const overlay = within(canvasElement.ownerDocument.body)
		const editor = getEditable(canvasElement)

		await userEvent.click(editor)
		await userEvent.keyboard("/")
		await userEvent.click(await overlay.findByText("Heading 1"))
		await userEvent.click(editor)
		await userEvent.keyboard("Playwright title")

		await waitFor(() => {
			expect(getMarkdownValue(canvasElement)).toContain("#\n\nPlaywright title")
		})
	},
}

export const InsertFrontmatterFromSlashMenu: Story = {
	args: EmptyDocument.args,
	play: async ({ canvasElement }) => {
		const overlay = within(canvasElement.ownerDocument.body)
		const editor = getEditable(canvasElement)

		await userEvent.click(editor)
		await userEvent.keyboard("/")
		await userEvent.click(await overlay.findByText("Frontmatter"))

		await waitFor(() => {
			const markdown = getMarkdownValue(canvasElement)
			expect(markdown).toContain("---")
			expect(markdown).toContain("title:")
		})
	},
}
