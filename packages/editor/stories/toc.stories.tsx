import type { Meta, StoryObj } from "@storybook/react-vite"
import { KEYS } from "../src/plate"
import { EditorStory } from "./editor-story-harness"

const meta = {
	component: EditorStory,
	title: "Editor/ToC",
} satisfies Meta<typeof EditorStory>

export default meta

type Story = StoryObj<typeof meta>

export const GeneratedHeadings: Story = {
	args: {
		title: "Table of Contents",
		description:
			"ToC plugin reads the current document heading structure and renders jump targets.",
		initialMarkdown: [
			"# Introduction",
			"",
			"Body copy.",
			"",
			"## Setup",
			"",
			"More content.",
			"",
			"### Details",
			"",
		].join("\n"),
		setup: (editor) => {
			editor.tf.insertNodes(
				{
					type: editor.getType(KEYS.toc),
					children: [{ text: "" }],
				},
				{ at: [0], select: true },
			)
		},
	},
}
