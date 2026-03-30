import { AIChatPlugin } from "@platejs/ai/react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { EditorStory } from "./editor-story-harness"

const meta = {
	component: EditorStory,
	title: "Editor/AI",
} satisfies Meta<typeof EditorStory>

export default meta

type Story = StoryObj<typeof meta>

export const CursorMenu: Story = {
	args: {
		title: "AI",
		description:
			"AI plugin anchor and popover mounted against a normal block selection target.",
		initialMarkdown:
			"Rewrite this paragraph into a shorter changelog summary.\n",
		setup: (editor) => {
			const end = editor.api.end([0])
			if (!end) return
			editor.tf.select({ anchor: end, focus: end })
			editor.getApi(AIChatPlugin).aiChat.show()
		},
	},
}
