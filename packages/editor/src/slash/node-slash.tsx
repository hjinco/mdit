import { AIChatPlugin } from "@platejs/ai/react"
import { EmojiInputPlugin } from "@platejs/emoji/react"
import {
	CalendarIcon,
	Code2,
	FileText,
	Heading1Icon,
	Heading2Icon,
	Heading3Icon,
	ImageIcon,
	LightbulbIcon,
	ListIcon,
	ListOrdered,
	Quote,
	RadicalIcon,
	SmileIcon,
	SparklesIcon,
	Square,
	Table,
	TableOfContentsIcon,
	TypeIcon,
} from "lucide-react"
import type { NodeComponent } from "platejs"
import { KEYS, PointApi, type TComboboxInputElement } from "platejs"
import type { PlateEditor, PlateElementProps } from "platejs/react"
import { PlateElement } from "platejs/react"
import { applyPreviousCodeBlockLanguage } from "../code/code-block-language"
import { CODE_DRAWING_KEY } from "../code/code-drawing-kit"
import {
	createDefaultFrontmatterRows,
	FRONTMATTER_KEY,
	requestFrontmatterFocus,
} from "../frontmatter"
import { WIKI_LINK_PLACEHOLDER_TEXT } from "../link/wiki-link-constants"
import {
	InlineCombobox,
	InlineComboboxContent,
	InlineComboboxEmpty,
	InlineComboboxGroup,
	InlineComboboxGroupLabel,
	InlineComboboxInput,
	InlineComboboxItem,
} from "../shared/inline-combobox"
import type { SlashHostDeps } from "../slash/slash-kit-types"
import { insertBlock, insertInlineElement } from "../slash/transforms"

function insertImageNode(
	editor: PlateEditor,
	path: string,
	resolveImageLink?: SlashHostDeps["resolveImageLink"],
	options?: any,
) {
	const imageData = resolveImageLink
		? resolveImageLink(path)
		: {
				url: path,
				wiki: false,
			}
	const imageNode = {
		type: editor.getType(KEYS.img),
		url: imageData.url,
		...(imageData.wiki ? { wiki: true, wikiTarget: imageData.wikiTarget } : {}),
		children: [{ text: "" }],
	}

	editor.tf.insertNodes(imageNode, {
		nextBlock: true,
		...options,
	} as any)
}

type Group = {
	group: string
	shouldHide?: (editor: PlateEditor) => boolean
	items: {
		icon: React.ReactNode
		value: string
		onSelect: (editor: PlateEditor, value: string) => void | Promise<void>
		className?: string
		focusEditor?: boolean
		keywords?: string[]
		label?: string
	}[]
}

function createSlashGroups(host: SlashHostDeps): Group[] {
	const groups: Group[] = [
		{
			group: "Document",
			shouldHide: (editor) => {
				const hasFrontmatter = editor.api.some({
					match: { type: FRONTMATTER_KEY },
				})
				const currentBlock = editor.api.node({ block: true, mode: "lowest" })
				const isInFirstTopLevelBlock = currentBlock
					? currentBlock[1][0] === 0
					: false
				const canInsertFrontmatter = isInFirstTopLevelBlock && !hasFrontmatter
				return !canInsertFrontmatter
			},
			items: [
				{
					icon: <TableOfContentsIcon />,
					keywords: ["metadata", "yaml", "head", "front matter"],
					label: "Frontmatter",
					value: "frontmatter",
					onSelect: async (editor: PlateEditor) => {
						if (editor.api.some({ match: { type: FRONTMATTER_KEY } })) return

						let defaults = createDefaultFrontmatterRows()
						if (host.getFrontmatterDefaults) {
							try {
								defaults = await host.getFrontmatterDefaults()
							} catch {
								defaults = createDefaultFrontmatterRows()
							}
						}

						editor.tf.replaceNodes(
							{
								type: FRONTMATTER_KEY,
								data: defaults,
								children: [{ text: "" }],
							},
							{ at: [0] },
						)
						requestFrontmatterFocus(editor.id, "firstCell")
					},
				},
			],
		},
		{
			group: "AI",
			items: [
				{
					focusEditor: false,
					icon: <SparklesIcon />,
					value: "AI",
					onSelect: (editor) => {
						editor.getApi(AIChatPlugin).aiChat.show()
					},
				},
			],
		},
		{
			group: "Basic blocks",
			items: [
				{
					icon: <TypeIcon />,
					keywords: ["paragraph"],
					label: "Text",
					value: KEYS.p,
				},
				{
					icon: <Heading1Icon />,
					keywords: ["title", "h1"],
					label: "Heading 1",
					value: KEYS.h1,
				},
				{
					icon: <Heading2Icon />,
					keywords: ["subtitle", "h2"],
					label: "Heading 2",
					value: KEYS.h2,
				},
				{
					icon: <Heading3Icon />,
					keywords: ["subtitle", "h3"],
					label: "Heading 3",
					value: KEYS.h3,
				},
				{
					icon: <ListIcon />,
					keywords: ["unordered", "ul", "-"],
					label: "Bulleted list",
					value: KEYS.ul,
				},
				{
					icon: <ListOrdered />,
					keywords: ["ordered", "ol", "1"],
					label: "Numbered list",
					value: KEYS.ol,
				},
				{
					icon: <Square />,
					keywords: ["checklist", "task", "checkbox", "[]", "ㅌ", "툳", "투두"],
					label: "To-do list",
					value: KEYS.listTodo,
				},
				{
					icon: <Code2 />,
					keywords: ["```"],
					label: "Code Block",
					value: KEYS.codeBlock,
				},
				{
					icon: <Table />,
					keywords: ["ㅌ", "텡", "테입", "테이브", "테이블"],
					label: "Table",
					value: KEYS.table,
				},
				{
					icon: <Quote />,
					keywords: ["citation", "blockquote", "quote", ">"],
					label: "Blockquote",
					value: KEYS.blockquote,
				},
				{
					description: "Insert a highlighted block.",
					icon: <LightbulbIcon />,
					keywords: ["note"],
					label: "Callout",
					value: KEYS.callout,
				},
			].map((item) => ({
				...item,
				onSelect: (editor, value) => {
					editor.tf.withoutNormalizing(() => {
						insertBlock(editor, value)
						if (value === KEYS.codeBlock) {
							applyPreviousCodeBlockLanguage(editor)
						}
					})
				},
			})),
		},
	]

	if (host.pickImageFile && host.resolveImageLink) {
		groups.push({
			group: "Media",
			items: [
				{
					icon: <ImageIcon />,
					keywords: [
						"picture",
						"photo",
						"ㅇ",
						"임",
						"이밎",
						"이미지",
						"ㅅ",
						"샂",
						"사지",
						"사진",
					],
					label: "Image",
					value: KEYS.img,
					onSelect: async (editor) => {
						const path = await host.pickImageFile!()
						if (path) {
							const block = editor.api.block()
							if (block) {
								insertImageNode(editor, path, host.resolveImageLink, {
									at: block[1],
									nextBlock: false,
								})
							} else {
								insertImageNode(editor, path, host.resolveImageLink)
							}
						}
					},
				},
			],
		})
	}

	groups.push(
		{
			group: "Advanced blocks",
			items: [
				{
					focusEditor: false,
					icon: <RadicalIcon />,
					label: "Equation",
					value: KEYS.equation,
				},
				{
					icon: <Code2 />,
					keywords: ["mermaid", "plantuml", "graphviz", "flowchart", "diagram"],
					label: "Code Drawing",
					value: CODE_DRAWING_KEY,
				},
			].map((item) => ({
				...item,
				onSelect: (editor, value) => {
					insertBlock(editor, value)
				},
			})),
		},
		{
			group: "Inline",
			items: [
				{
					focusEditor: false,
					icon: <SmileIcon />,
					keywords: ["emoji", "smile", "이모지"],
					label: "Emoji",
					value: "emoji",
					onSelect: (editor: PlateEditor) => {
						const emojiInputType = editor.getType(EmojiInputPlugin.key)
						editor.tf.insertNodes({
							type: emojiInputType,
							children: [{ text: "" }],
						})
					},
				},
				{
					focusEditor: true,
					icon: <CalendarIcon />,
					keywords: ["time"],
					label: "Date",
					value: KEYS.date,
				},
				{
					focusEditor: false,
					icon: <RadicalIcon />,
					label: "Inline Equation",
					value: KEYS.inlineEquation,
				},
				{
					focusEditor: false,
					icon: <FileText />,
					keywords: ["wiki", "link", "internal", "note", "page"],
					label: "Wiki Link",
					value: "wikiLink",
					onSelect: (editor: PlateEditor) => {
						editor.tf.insertNodes(
							{
								type: KEYS.link,
								url: "",
								wiki: true,
								wikiTarget: "",
								children: [{ text: WIKI_LINK_PLACEHOLDER_TEXT }],
							},
							{ select: true },
						)
						// Defer: combobox close can overwrite selection; move cursor to end of link
						const linkType = editor.getType(KEYS.link)
						setTimeout(() => {
							const sel = editor.selection
							if (!sel) return
							const linkEntry = editor.api.above({
								at: sel.anchor,
								match: { type: linkType },
							})
							if (!linkEntry) return
							const [, path] = linkEntry
							const end = editor.api.end(path)
							if (end) {
								editor.tf.select({ anchor: end, focus: end })
								editor.tf.focus()
							}
						}, 0)
					},
				},
			].map((item) => {
				if (item.onSelect) {
					return item
				}

				return {
					...item,
					onSelect: (editor: PlateEditor, value: string) => {
						insertInlineElement(editor, value)
					},
				}
			}),
		},
	)

	return groups
}

export const createSlashInputElement = (
	host: SlashHostDeps = {},
): NodeComponent => {
	const groups = createSlashGroups(host)

	return function SlashInputElement(
		props: PlateElementProps<TComboboxInputElement>,
	) {
		const { editor, element } = props

		const elementPath = editor.api.findPath(element)
		const beforePoint = elementPath ? editor.api.before(elementPath) : null
		const blockEntry =
			beforePoint &&
			editor.api.above({
				at: beforePoint,
				match: editor.api.isBlock,
				mode: "highest",
			})
		const blockStart = blockEntry && editor.api.start(blockEntry[1])
		const isAtBlockStart =
			!!beforePoint && !!blockStart && PointApi.equals(beforePoint, blockStart)

		return (
			<PlateElement {...props} as="span">
				<InlineCombobox element={element} trigger="/">
					<InlineComboboxInput />

					<InlineComboboxContent>
						<InlineComboboxEmpty>No results</InlineComboboxEmpty>

						{groups
							.filter(({ shouldHide, group }) => {
								if (!isAtBlockStart && group !== "Inline") {
									return false
								}
								return !shouldHide?.(editor)
							})
							.map(({ group, items }) => {
								return (
									<InlineComboboxGroup key={group}>
										<InlineComboboxGroupLabel>{group}</InlineComboboxGroupLabel>

										{items.map(
											({
												focusEditor,
												icon,
												keywords,
												label,
												value,
												onSelect,
											}) => (
												<InlineComboboxItem
													key={value}
													value={value}
													onClick={() => {
														void onSelect(editor, value)
													}}
													label={label}
													focusEditor={focusEditor}
													group={group}
													keywords={keywords}
												>
													<div className="mr-2 text-muted-foreground">
														{icon}
													</div>
													{label ?? value}
												</InlineComboboxItem>
											),
										)}
									</InlineComboboxGroup>
								)
							})
							.filter(Boolean)}
					</InlineComboboxContent>
				</InlineCombobox>

				{props.children}
			</PlateElement>
		)
	}
}
