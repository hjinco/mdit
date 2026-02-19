import { AIChatPlugin } from "@platejs/ai/react"
import { EmojiInputPlugin } from "@platejs/emoji/react"
import { open } from "@tauri-apps/plugin-dialog"
import { readDir, readTextFile } from "@tauri-apps/plugin-fs"
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
import { dirname, resolve } from "pathe"
import { KEYS, PointApi, type TComboboxInputElement } from "platejs"
import type { PlateEditor, PlateElementProps } from "platejs/react"
import { PlateElement } from "platejs/react"
import YAML from "yaml"
import { useStore } from "@/store"
import { datePattern, type ValueType } from "@/utils/frontmatter-value-utils"
// import { DATABASE_KEY } from "../plugins/database-kit"
import { FRONTMATTER_KEY } from "../plugins/frontmatter-kit"
import { applyPreviousCodeBlockLanguage } from "../utils/code-block-language"
import { buildImageLinkData } from "../utils/image-link"
import { insertBlock, insertInlineElement } from "../utils/transforms"
import {
	InlineCombobox,
	InlineComboboxContent,
	InlineComboboxEmpty,
	InlineComboboxGroup,
	InlineComboboxGroupLabel,
	InlineComboboxInput,
	InlineComboboxItem,
} from "./inline-combobox"
import type { KVRow } from "./node-frontmatter-table"

const MAX_REFERENCED_NOTES = 5

function createRowId() {
	return Math.random().toString(36).slice(2, 9)
}

function detectValueType(value: unknown): ValueType | null {
	if (value instanceof Date) return "date"
	if (typeof value === "string" && datePattern.test(value)) return "date"

	if (typeof value === "boolean") return "boolean"
	if (typeof value === "number" && Number.isFinite(value)) return "number"
	if (Array.isArray(value)) return "array"
	if (value === null || value === undefined) return "string"
	if (typeof value === "string") return "string"

	return null
}

const frontmatterPattern = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

function extractFrontmatterSource(markdown: string): string | null {
	const trimmed = markdown.startsWith("\ufeff") ? markdown.slice(1) : markdown
	const match = frontmatterPattern.exec(trimmed)

	return match ? match[1] : null
}

function insertImageNode(editor: PlateEditor, path: string, options?: any) {
	const imageData = buildImageLinkData(path)
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

async function collectFrontmatterDefaults(): Promise<KVRow[]> {
	const tabPath = useStore.getState().tab?.path
	if (!tabPath) {
		return []
	}

	try {
		const tabDir = dirname(tabPath)
		const entries = await readDir(tabDir)
		const siblingNotes = entries
			.filter((entry) => !entry.isDirectory && entry.name.endsWith(".md"))
			.map((entry) => ({
				absolutePath: resolve(tabDir, entry.name),
				name: entry.name,
			}))
			.filter((entry) => entry.absolutePath !== tabPath)
			.sort((a, b) => a.absolutePath.localeCompare(b.absolutePath))
			.slice(0, MAX_REFERENCED_NOTES)

		const keyOrder: string[] = []
		const fieldMap = new Map<string, ValueType | null>()

		await Promise.all(
			siblingNotes.map(async (entry) => {
				try {
					const content = await readTextFile(entry.absolutePath)
					const source = extractFrontmatterSource(content)
					if (!source) return

					const parsed = YAML.parse(source)
					if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
						return
					}

					for (const [key, rawValue] of Object.entries(
						parsed as Record<string, unknown>,
					)) {
						if (!key) continue
						const detectedType = detectValueType(rawValue)
						if (!detectedType) continue

						if (!fieldMap.has(key)) {
							fieldMap.set(key, detectedType)
							keyOrder.push(key)
							continue
						}

						const existing = fieldMap.get(key)
						if (existing === null) continue

						if (existing !== detectedType) {
							fieldMap.set(key, null)
						}
					}
				} catch {
					// Ignore read/parse errors from sibling notes
				}
			}),
		)

		const rows = keyOrder
			.map((key) => {
				const type = fieldMap.get(key)
				if (!type) return null
				return { key, type }
			})
			.filter((item): item is { key: string; type: ValueType } => item !== null)
			.map(({ key, type }) => ({
				id: createRowId(),
				key,
				type,
				value: defaultValueForType(type),
			}))
		if (rows.length === 0) {
			return [
				{
					id: createRowId(),
					key: "title",
					type: "string",
					value: "",
				},
			]
		}

		return rows
	} catch {
		return [
			{
				id: createRowId(),
				key: "title",
				type: "string",
				value: "",
			},
		]
	}
}

function defaultValueForType(type: ValueType): unknown {
	switch (type) {
		case "boolean":
			return false
		case "number":
			return ""
		case "date":
			return ""
		case "array":
			return []
		case "string":
			return ""
		default:
			return ""
	}
}

type Group = {
	group: string
	shouldHide?: (editor: PlateEditor) => boolean
	items: {
		icon: React.ReactNode
		value: string
		onSelect: (editor: PlateEditor, value: string) => void
		className?: string
		focusEditor?: boolean
		keywords?: string[]
		label?: string
	}[]
}

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

					const defaults = await collectFrontmatterDefaults()
					useStore.getState().setFrontmatterFocusTarget("firstCell")
					editor.tf.replaceNodes(
						{
							type: FRONTMATTER_KEY,
							data: defaults,
							children: [{ text: "" }],
						},
						{ at: [0] },
					)
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
	{
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
					const path = await open({
						multiple: false,
						directory: false,
						filters: [
							{
								name: "Images",
								extensions: ["jpg", "jpeg", "png", "gif", "webp"],
							},
						],
					})
					if (path) {
						const block = editor.api.block()
						if (block) {
							insertImageNode(editor, path, {
								at: block[1],
								nextBlock: false,
							})
						} else {
							insertImageNode(editor, path)
						}
					}
				},
			},
		],
	},
	{
		group: "Advanced blocks",
		items: [
			// {
			// 	icon: <TableOfContentsIcon />,
			// 	keywords: ["toc"],
			// 	label: "Table of contents",
			// 	value: KEYS.toc,
			// },
			// {
			//   icon: <Columns3Icon />,
			//   label: '3 columns',
			//   value: 'action_three_columns',
			// },
			{
				focusEditor: false,
				icon: <RadicalIcon />,
				label: "Equation",
				value: KEYS.equation,
			},
			// {
			// 	focusEditor: false,
			// 	icon: <Database />,
			// 	keywords: ["database", "db", "데이터베이스"],
			// 	label: "Database",
			// 	value: DATABASE_KEY,
			// },
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
				onSelect: (editor: PlateEditor, _value: string) => {
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
				onSelect: (editor: PlateEditor, _value: string) => {
					// Insert a wiki link placeholder that the user can edit
					editor.tf.insertNodes({
						type: KEYS.link,
						url: "",
						wiki: true,
						wikiTarget: "Page Title",
						children: [{ text: "Page Title" }],
					})
					// Select the text for easy editing
					const selection = editor.selection
					if (selection) {
						const entry = editor.api.node({
							at: selection,
							match: { type: KEYS.link },
						})
						if (entry) {
							const [, path] = entry
							editor.tf.select({
								anchor: { path: [...path, 0], offset: 0 },
								focus: { path: [...path, 0], offset: 10 }, // "Page Title".length
							})
						}
					}
				},
			},
		].map((item) => {
			// Skip mapping if onSelect is already defined (for emoji)
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
]

export function SlashInputElement(
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
							// If in the middle of a block, only show Inline group
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
												onClick={() => onSelect(editor, value)}
												label={label}
												focusEditor={focusEditor}
												group={group}
												keywords={keywords}
											>
												<div className="mr-2 text-muted-foreground">{icon}</div>
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
