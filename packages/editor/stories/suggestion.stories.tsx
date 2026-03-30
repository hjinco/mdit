import type { Meta, StoryObj } from "@storybook/react-vite"
import { KEYS } from "../src/plate"
import { EditorStory } from "./editor-story-harness"

const meta = {
	component: EditorStory,
	title: "Editor/Suggestion",
} satisfies Meta<typeof EditorStory>

export default meta

type Story = StoryObj<typeof meta>

export const InlineSuggestion: Story = {
	args: {
		title: "Suggestion",
		description:
			"Inline suggestion decorations rendered on top of normal paragraph content.",
		initialMarkdown: "Ship the editor cleanup this week.\n",
		setup: (editor) => {
			editor.tf.setNodes(
				{
					[KEYS.suggestion]: true,
					[`${KEYS.suggestion}_demo`]: {
						createdAt: Date.now(),
						id: "demo",
						type: "insert",
						userId: "1",
					},
				},
				{ at: [0, 0] },
			)
		},
	},
}
