import type { Meta, StoryObj } from "@storybook/react-vite"
import { EditorStory } from "./editor-story-harness"

const meta = {
	component: EditorStory,
	title: "Editor/Emoji",
} satisfies Meta<typeof EditorStory>

export default meta

type Story = StoryObj<typeof meta>

export const EmojiInline: Story = {
	args: {
		title: "Emoji",
		description: "Inline emoji nodes rendered inside realistic prose.",
		initialMarkdown: "Ship checklist 🚀\n\nCelebrate the editor cleanup ✨\n",
	},
}
