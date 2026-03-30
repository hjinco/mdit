import { BlockSelectionPlugin } from "@platejs/selection/react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { EditorStory } from "./editor-story-harness"

const meta = {
	component: EditorStory,
	title: "Editor/Selection",
} satisfies Meta<typeof EditorStory>

export default meta

type Story = StoryObj<typeof meta>

export const BlockSelectionState: Story = {
	args: {
		title: "Selection",
		description:
			"Block selection, drag handles, and floating toolbar plugins mounted on a multi-block document.",
		initialMarkdown: [
			"# Weekly review",
			"",
			"First block for selection.",
			"",
			"Second block for selection.",
			"",
		].join("\n"),
		setup: (editor) => {
			const block =
				editor.api.block({ at: [1] }) ?? editor.api.block({ at: [0] })
			const id = block?.[0]?.id as string | undefined
			if (!id) return
			editor.getApi(BlockSelectionPlugin).blockSelection.set(id)
		},
	},
}
