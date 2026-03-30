import { insertDate } from "@platejs/date"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { EditorStory } from "./editor-story-harness"

const meta = {
	component: EditorStory,
	title: "Editor/Date",
} satisfies Meta<typeof EditorStory>

export default meta

type Story = StoryObj<typeof meta>

export const DateTokens: Story = {
	args: {
		title: "Date",
		description:
			"Date plugin UI inserted as a real inline element inside normal editor content.",
		initialMarkdown: "## Calendar\n\nMeeting date: \n\nFollow-up paragraph.\n",
		setup: (editor) => {
			const end = editor.api.end([1])
			if (!end) return
			editor.tf.select({ anchor: end, focus: end })
			insertDate(editor, { select: true })
		},
	},
}
