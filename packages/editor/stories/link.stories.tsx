import type { Meta, StoryObj } from "@storybook/react-vite"
import { EditorStory } from "./editor-story-harness"

const meta = {
	component: EditorStory,
	title: "Editor/Link",
} satisfies Meta<typeof EditorStory>

export default meta

type Story = StoryObj<typeof meta>

export const ExternalAndWikiLinks: Story = {
	args: {
		title: "Link",
		description:
			"External links and wiki links rendered together with the editor-specific link element.",
		initialMarkdown: [
			"[OpenAI](https://openai.com)",
			"",
			"Open [[docs/editor-guide]] from this note.",
			"",
		].join("\n"),
	},
}
