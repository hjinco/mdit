import { createSlateEditor, type Value } from "platejs"

type SlateEditorCreateOptions = Parameters<typeof createSlateEditor>[0]
type SlatePlugins = NonNullable<SlateEditorCreateOptions>["plugins"]

type MarkdownFallbackLogger = Pick<Console, "warn">

export type CreateMarkdownDeserializerWithFallbackOptions = {
	mdxPlugins: SlatePlugins
	noMdxPlugins: SlatePlugins
	logger?: MarkdownFallbackLogger
	createFallbackValue?: () => Value
}

export type DeserializeMarkdownWithFallbackInput = {
	content: string
	path?: string
}

const createDefaultFallbackEditorValue = (): Value => [
	{
		type: "p",
		children: [{ text: "" }],
	},
]

export const createSlateEditorWithPlugins = (plugins: SlatePlugins) =>
	createSlateEditor({
		plugins,
	})

export const createMarkdownDeserializerWithFallback = ({
	mdxPlugins,
	noMdxPlugins,
	logger = console,
	createFallbackValue = createDefaultFallbackEditorValue,
}: CreateMarkdownDeserializerWithFallbackOptions) => {
	const mdxEditor = createSlateEditorWithPlugins(mdxPlugins)
	let noMdxEditor: ReturnType<typeof createSlateEditor> | null = null

	const getOrCreateNoMdxEditor = () => {
		if (!noMdxEditor) {
			noMdxEditor = createSlateEditorWithPlugins(noMdxPlugins)
		}

		return noMdxEditor
	}

	return ({ content, path }: DeserializeMarkdownWithFallbackInput): Value => {
		try {
			return mdxEditor.api.markdown.deserialize(content)
		} catch (error) {
			logger.warn(
				"MDX parse failed while opening note, falling back to no-MDX:",
				{
					path,
					error,
				},
			)
		}

		try {
			return getOrCreateNoMdxEditor().api.markdown.deserialize(content)
		} catch (error) {
			logger.warn("No-MDX fallback parse failed while opening note:", {
				path,
				error,
			})
			return createFallbackValue()
		}
	}
}
