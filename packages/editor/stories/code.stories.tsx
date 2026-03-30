import type { Meta, StoryObj } from "@storybook/react-vite"
import { EditorStory } from "./editor-story-harness"

const meta = {
	component: EditorStory,
	title: "Editor/Code",
} satisfies Meta<typeof EditorStory>

export default meta

type Story = StoryObj<typeof meta>

export const CodeBlocks: Story = {
	args: {
		title: "Code",
		description:
			"Inline code and fenced code block UI in a single editor scenario.",
		initialMarkdown: [
			"Use `pnpm test:packages` to validate editor packages.",
			"",
			"```ts",
			"export function greet(name: string) {",
			"\treturn `hello $" + "{name}`",
			"}",
			"```",
			"",
		].join("\n"),
	},
}
