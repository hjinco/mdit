import remarkWikiLink from "@flowershow/remark-wiki-link"
import { DATABASE_KEY } from "@mdit/editor/plugins/database-kit"
import {
	convertValueToType,
	datePattern,
	type ValueType,
} from "@mdit/editor/utils/frontmatter-value-utils"
import {
	hasParentTraversal,
	WINDOWS_ABSOLUTE_REGEX,
} from "@mdit/editor/utils/link-utils"
import {
	convertChildrenDeserialize,
	convertNodesSerialize,
	MarkdownPlugin,
	type MdMdxJsxFlowElement,
	parseAttributes,
	propsToAttributes,
	remarkMdx,
	remarkMention,
} from "@platejs/markdown"
import { phrasing } from "mdast-util-phrasing"
import { getPluginType, KEYS, type TEquationElement } from "platejs"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import YAML from "yaml"
import type { KVRow } from "../ui/node-frontmatter-table"
import { FRONTMATTER_KEY } from "./frontmatter-kit"

const EQUATION_ENVIRONMENT_REGEX =
	/^\\begin\{([^}]+)\}[\r\n]+([\s\S]*?)[\r\n]+\\end\{\1\}\s*$/

type MdastRoot = {
	type: "root"
	children: MdastNode[]
}

type MdastNode = {
	type?: string
	children?: MdastNode[]
	value?: string
}

function createRowId() {
	return Math.random().toString(36).slice(2, 9)
}

function rowsToRecord(
	data: KVRow[] | Record<string, unknown> | undefined,
): Record<string, unknown> {
	if (Array.isArray(data)) {
		return data.reduce<Record<string, unknown>>((acc, row) => {
			if (!row.key) return acc
			acc[row.key] = convertValueToType(row.value, row.type)
			return acc
		}, {})
	}

	if (data && typeof data === "object") {
		return data
	}

	return {}
}

function detectValueType(value: unknown): ValueType {
	if (typeof value === "boolean") return "boolean"
	if (typeof value === "number") return "number"
	if (Array.isArray(value)) return "array"
	if (
		value instanceof Date ||
		(typeof value === "string" &&
			!Number.isNaN(Date.parse(value)) &&
			datePattern.test(value))
	)
		return "date"
	return "string"
}

function toRowsFromRecord(value: unknown): KVRow[] {
	if (!value || typeof value !== "object" || Array.isArray(value)) return []

	return Object.entries(value as Record<string, unknown>).map(([key, val]) => ({
		id: createRowId(),
		key,
		value: val,
		type: detectValueType(val),
	}))
}

function parseFrontmatterYaml(yamlSource: string): KVRow[] {
	try {
		return toRowsFromRecord(YAML.parse(yamlSource))
	} catch {
		return []
	}
}

function safelyDecodeUri(url: string): string {
	try {
		return decodeURI(url)
	} catch (error) {
		if (error instanceof URIError) {
			return url
		}
		throw error
	}
}

function isInternalLink(url: string): boolean {
	const trimmed = url.trim().toLowerCase()
	if (!trimmed) return false
	return !trimmed.startsWith("http://") && !trimmed.startsWith("https://")
}

function normalizeWikiTarget(url: string): string {
	let value = safelyDecodeUri(url.trim())

	while (value.startsWith("./")) {
		value = value.slice(2)
	}
	while (value.startsWith("/")) {
		value = value.slice(1)
	}

	const [pathPart, hashPart] = value.split("#", 2)
	let normalizedPath = pathPart

	if (normalizedPath.endsWith(".mdx")) {
		normalizedPath = normalizedPath.slice(0, -4)
	} else if (normalizedPath.endsWith(".md")) {
		normalizedPath = normalizedPath.slice(0, -3)
	}

	return hashPart ? `${normalizedPath}#${hashPart}` : normalizedPath
}

function getPlainText(value: unknown): string {
	if (value == null) return ""
	if (typeof value === "string") return value
	if (Array.isArray(value)) return value.map(getPlainText).join("")
	if (typeof value === "object") {
		const maybeText = value as { text?: string; children?: unknown }
		if (typeof maybeText.text === "string") return maybeText.text
		if (maybeText.children) return getPlainText(maybeText.children)
	}
	return ""
}

function isWikiEmbedTargetSafe(path: string): boolean {
	const normalized = path.trim()
	if (!normalized) return false
	if (normalized.startsWith("/")) return false
	if (WINDOWS_ABSOLUTE_REGEX.test(normalized)) return false
	return !hasParentTraversal(normalized)
}

function isEmptyParagraph(node: MdastNode | undefined): boolean {
	if (!node || node.type !== "paragraph") return false
	if (!node.children || node.children.length === 0) return true
	return node.children.every((child) => {
		if (child.type !== "text") return false
		const value = typeof child.value === "string" ? child.value : ""
		return value.replace(/\u200b/g, "").trim().length === 0
	})
}

export const MarkdownKit = [
	MarkdownPlugin.configure({
		options: {
			disallowedNodes: [KEYS.slashCommand],
			remarkPlugins: [
				remarkMath,
				remarkGfm,
				remarkMdx,
				remarkMention,
				remarkFrontmatter,
				remarkWikiLink,
			],
			remarkStringifyOptions: {
				handlers: {
					root: (node: MdastRoot, _parent: unknown, state: any, info: any) => {
						const children = [...node.children]
						while (children.length > 0 && isEmptyParagraph(children.at(-1))) {
							children.pop()
						}

						const hasPhrasing = children.some(phrasing)
						const container = hasPhrasing
							? state.containerPhrasing
							: state.containerFlow

						return container.call(state, { ...node, children }, info)
					},
				},
			},
			rules: {
				[FRONTMATTER_KEY]: {
					serialize: (node) => {
						const record = rowsToRecord(node?.data as any)
						const yaml = YAML.stringify(record)
						const value = `---\n${yaml === "{}\n" ? "" : yaml}---`
						return { type: "html", value }
					},
				},
				[KEYS.equation]: {
					serialize: (node: TEquationElement) => {
						const environment = node.environment || "equation"
						const texExpression = node.texExpression ?? ""
						const value = `\\begin{${environment}}\n${texExpression}\n\\end{${environment}}`

						return {
							type: "math",
							value,
						}
					},
					deserialize: (mdastNode: { value: string }) => {
						const match = EQUATION_ENVIRONMENT_REGEX.exec(mdastNode.value)
						if (!match)
							return {
								type: KEYS.equation,
								texExpression: "",
								environment: "equation",
								children: [{ text: "" }],
							}

						const [, environment, body] = match

						return {
							type: KEYS.equation,
							texExpression: body.trim(),
							environment,
							children: [{ text: "" }],
						}
					},
				},
				yaml: {
					deserialize: (mdastNode) => {
						return {
							type: FRONTMATTER_KEY,
							data: parseFrontmatterYaml(mdastNode.value),
							children: [{ text: "" }],
						}
					},
				},
				[KEYS.link]: {
					serialize: (node: any, options): any => {
						const rawUrl = node.url ?? ""
						const shouldSerializeWiki = Boolean(node.wiki || node.wikiTarget)

						if (shouldSerializeWiki) {
							const target = node.wikiTarget || normalizeWikiTarget(rawUrl)

							if (!target) {
								return {
									type: "link",
									url: rawUrl,
									children: convertNodesSerialize(node.children, options),
								}
							}

							const text = getPlainText(node.children).trim()
							const alias = text && text !== target ? text : undefined

							return {
								type: "wikiLink",
								value: target,
								data: alias ? { alias } : {},
							}
						}

						return {
							type: "link",
							url: rawUrl,
							children: convertNodesSerialize(node.children, options),
						}
					},
				},
				[KEYS.img]: {
					serialize: (node: any): any => {
						const rawUrl = node.url ?? ""
						const shouldSerializeWiki = Boolean(node.wiki || node.wikiTarget)
						const wikiSource = node.wikiTarget || rawUrl

						if (
							shouldSerializeWiki &&
							isInternalLink(wikiSource) &&
							isWikiEmbedTargetSafe(wikiSource)
						) {
							const target = node.wikiTarget || normalizeWikiTarget(rawUrl)
							if (target) {
								return {
									type: "paragraph",
									children: [
										{
											type: "embed",
											value: target,
											data: {},
										},
									],
								}
							}
						}

						const captionText = node.caption
							? node.caption
									.map((c: { text?: string }) => c.text ?? "")
									.join("")
							: undefined

						return {
							type: "paragraph",
							children: [
								{
									alt: captionText,
									title: captionText,
									type: "image",
									url: rawUrl,
								},
							],
						}
					},
				},
				embed: {
					deserialize: (mdastNode, _deco, options) => {
						const target = mdastNode.value || ""
						if (!isWikiEmbedTargetSafe(target)) {
							const hName = mdastNode.data?.hName
							const hProperties = mdastNode.data?.hProperties ?? {}
							if (hName === "img") {
								const altText =
									typeof hProperties.alt === "string" ? hProperties.alt : ""
								return {
									type: getPluginType(options.editor!, KEYS.img),
									url: "",
									caption: [{ text: altText }],
									children: [{ text: "" }],
								}
							}
							return {
								type: getPluginType(options.editor!, KEYS.link),
								url: "",
								children: [{ text: target }],
							}
						}

						const hName = mdastNode.data?.hName
						const hProperties = mdastNode.data?.hProperties ?? {}
						const url = hProperties.src || mdastNode.data?.path || target

						if (hName === "img") {
							const altText =
								typeof hProperties.alt === "string" ? hProperties.alt : ""

							return {
								type: getPluginType(options.editor!, KEYS.img),
								url,
								wiki: true,
								wikiTarget: target,
								caption: [{ text: altText }],
								children: [{ text: "" }],
							}
						}

						return {
							type: getPluginType(options.editor!, KEYS.link),
							url,
							wiki: true,
							wikiTarget: target,
							children: [{ text: target }],
						}
					},
				},
				callout: {
					deserialize: (mdastNode, deco, options) => {
						const props = parseAttributes(mdastNode.attributes)
						return {
							children: convertChildrenDeserialize(
								mdastNode.children,
								deco,
								options,
							),
							type: getPluginType(options.editor!, KEYS.callout),
							...props,
						}
					},
					serialize(slateNode, options): MdMdxJsxFlowElement {
						const { icon, backgroundColor, variant } = slateNode
						const attributes = propsToAttributes({
							icon,
							backgroundColor,
							variant,
						}).filter((attribute) => attribute.value !== "null")
						return {
							attributes,
							children: convertNodesSerialize(
								slateNode.children,
								options,
							) as any,
							name: "callout",
							type: "mdxJsxFlowElement",
						}
					},
				},
				database: {
					deserialize: (mdastNode, deco, options) => {
						const props = parseAttributes(mdastNode.attributes)
						return {
							children: convertChildrenDeserialize(
								mdastNode.children || [],
								deco,
								options,
							),
							...props,
							folder: String(props.folder),
							sortOption: props.sortOption,
							sortDirection: props.sortDirection,
							type: getPluginType(options.editor!, DATABASE_KEY),
						}
					},
					serialize(slateNode, options): MdMdxJsxFlowElement {
						const attributes = propsToAttributes({
							folder: slateNode.folder ?? null,
							sortOption: slateNode.sortOption ?? null,
							sortDirection: slateNode.sortDirection ?? null,
						}).filter((attribute) => attribute.value !== "null")
						return {
							attributes,
							children: convertNodesSerialize(
								slateNode.children,
								options,
							) as any,
							name: "database",
							type: "mdxJsxFlowElement",
						}
					},
				},
				wikiLink: {
					serialize: (node) => {
						const target = node.wikiTarget || node.url || ""
						const text = getPlainText(node.children).trim()
						if (text && text !== target) {
							return {
								type: "wikiLink",
								value: target,
								data: {
									alias: text,
								},
							}
						}
						return {
							type: "wikiLink",
							value: target,
							data: {},
						}
					},
					deserialize: (mdastNode) => {
						const target = mdastNode.value || ""
						const alias = mdastNode.data?.alias
						if (!isWikiEmbedTargetSafe(target)) {
							return {
								type: KEYS.link,
								url: "",
								children: [{ text: alias || target }],
							}
						}
						return {
							type: KEYS.link,
							url: target,
							wiki: true,
							wikiTarget: target,
							children: [{ text: alias || target }],
						}
					},
				},
			},
		},
	}),
]
