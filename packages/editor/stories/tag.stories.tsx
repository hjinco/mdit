import type { Meta, StoryObj } from "@storybook/react-vite"
import { EditorStory } from "./editor-story-harness"

const meta = {
	component: EditorStory,
	title: "Editor/Tag",
} satisfies Meta<typeof EditorStory>

export default meta

type Story = StoryObj<typeof meta>

export const InlineTags: Story = {
	args: {
		title: "Tag",
		description:
			"Tag decorator highlights hashtag-like tokens while leaving code spans untouched.",
		initialMarkdown:
			"Track #editor and #storybook work, but ignore `#inside-code`.\n",
	},
}
