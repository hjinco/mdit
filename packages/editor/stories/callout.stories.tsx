import type { Meta, StoryObj } from "@storybook/react-vite"
import { EditorStory } from "./editor-story-harness"

const meta = {
	component: EditorStory,
	title: "Editor/Callout",
} satisfies Meta<typeof EditorStory>

export default meta

type Story = StoryObj<typeof meta>

export const ObsidianCallout: Story = {
	args: {
		title: "Callout",
		description:
			"Callout block UI with markdown serialization preserved in the side panel.",
		initialMarkdown:
			"> [!note] Release notes\n> Storybook now renders plugin-specific editor stories.\n",
	},
}
