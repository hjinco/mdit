import type { Meta, StoryObj } from "@storybook/react-vite"
import { EditorStory } from "./editor-story-harness"

const meta = {
	component: EditorStory,
	title: "Editor/Frontmatter",
} satisfies Meta<typeof EditorStory>

export default meta

type Story = StoryObj<typeof meta>

export const ExistingRows: Story = {
	args: {
		title: "Frontmatter",
		description:
			"Frontmatter table UI with pre-populated rows and a normal body section below it.",
		initialMarkdown:
			"---\ntitle: Existing note\ntags:\n  - editor\n  - storybook\nsummary: Plugin-specific harness\n---\n\nBody paragraph.\n",
	},
}
