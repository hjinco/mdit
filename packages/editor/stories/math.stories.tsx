import type { Meta, StoryObj } from "@storybook/react-vite"
import { EditorStory } from "./editor-story-harness"

const meta = {
	component: EditorStory,
	title: "Editor/Math",
} satisfies Meta<typeof EditorStory>

export default meta

type Story = StoryObj<typeof meta>

export const Equations: Story = {
	args: {
		title: "Math",
		description:
			"Inline and block math rendering for KaTeX-backed editor content.",
		initialMarkdown:
			"Euler identity $e^{i\\pi} + 1 = 0$.\n\n$$\n\\int_0^1 x^2 dx = \\frac{1}{3}\n$$\n",
	},
}
