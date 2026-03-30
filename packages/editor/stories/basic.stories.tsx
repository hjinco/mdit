import type { Meta, StoryObj } from "@storybook/react-vite"
import { EditorStory } from "./editor-story-harness"

const meta = {
	component: EditorStory,
	title: "Editor/Basic",
} satisfies Meta<typeof EditorStory>

export default meta

type Story = StoryObj<typeof meta>

export const CommonBlocks: Story = {
	args: {
		title: "Basic Blocks",
		description:
			"Paragraphs, headings, quotes, and lists rendered with the editor UI.",
		initialMarkdown:
			"# Storybook document\n\nA paragraph with **bold** and `code`.\n\n> Blockquote\n\n- one\n- two\n",
	},
}
