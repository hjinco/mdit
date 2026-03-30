import { TablePlugin } from "@platejs/table/react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { EditorStory } from "./editor-story-harness"

const meta = {
	component: EditorStory,
	title: "Editor/Table",
} satisfies Meta<typeof EditorStory>

export default meta

type Story = StoryObj<typeof meta>

export const BasicTable: Story = {
	args: {
		title: "Table",
		description:
			"Table plugin UI inserted with the same transform used by editor commands.",
		initialMarkdown: "",
		setup: (editor) => {
			editor.getTransforms(TablePlugin).insert.table({}, { select: true })
		},
	},
}
