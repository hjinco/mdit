import remarkWikiLink from "@flowershow/remark-wiki-link"
import {
	convertNodesSerialize,
	type DeserializeMdOptions,
	MarkdownPlugin,
	type MdRootContent,
	remarkMdx,
	remarkMention,
	type SerializeMdOptions,
} from "@platejs/markdown"
import remarkCallout from "@r4ai/remark-callout"
import { phrasing } from "mdast-util-phrasing"
import {
	type Descendant,
	getPluginType,
	KEYS,
	type TEquationElement,
} from "platejs"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import YAML from "yaml"
import type { FrontmatterRow as KVRow } from "../frontmatter"
import {
	convertValueToType,
	detectFrontmatterValueType,
	FRONTMATTER_KEY,
} from "../frontmatter"
import { hasParentTraversal, WINDOWS_ABSOLUTE_REGEX } from "../link/link-utils"
import { getPlainText } from "./markdown-utils"
import {
	calloutMarkdownRule,
	remarkObsidianCalloutBridge,
	remarkObsidianCalloutStringifyHandlers,
} from "./obsidian-callout-markdown"
import {
	OBSIDIAN_EMBED_KEY,
	ObsidianEmbedPlugin,
} from "./obsidian-embed-plugin"

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
	data?: {
		alias?: string
		hName?: string
		hProperties?: Record<string, unknown>
		path?: string
	}
}

type SlateNodeWithChildren = {
	children: Descendant[]
	[key: string]: unknown
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

function toRowsFromRecord(value: unknown): KVRow[] {
	if (!value || typeof value !== "object" || Array.isArray(value)) return []

	return Object.entries(value as Record<string, unknown>).map(([key, val]) => {
		const type = detectFrontmatterValueType(key, val)

		return {
			id: createRowId(),
			key,
			value: type === "tags" ? convertValueToType(val, type) : val,
			type,
		}
	})
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

function parsePositiveDimension(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return value
	}

	if (typeof value === "string" && /^\d+$/.test(value)) {
		const parsed = Number.parseInt(value, 10)
		return parsed > 0 ? parsed : undefined
	}

	return undefined
}

function getEmbedDimensions(mdastNode: MdastNode): {
	width?: number
	height?: number
} {
	const hProperties = mdastNode.data?.hProperties ?? {}
	const width = parsePositiveDimension(hProperties["data-fs-width"])
	const height = width
		? parsePositiveDimension(hProperties["data-fs-height"])
		: undefined

	return { width, height }
}

function createEmbedNodeData(
	width: unknown,
	height: unknown,
): {
	hProperties?: Record<string, unknown>
} {
	const normalizedWidth = parsePositiveDimension(width)
	const normalizedHeight = normalizedWidth
		? parsePositiveDimension(height)
		: undefined

	if (!normalizedWidth) {
		return {}
	}

	return {
		hProperties: {
			"data-fs-width": normalizedWidth,
			...(normalizedHeight ? { "data-fs-height": normalizedHeight } : {}),
		},
	}
}

export type CreateMarkdownKitOptions = {
	mdx?: boolean
}

export const createMarkdownKit = ({
	mdx = true,
}: CreateMarkdownKitOptions = {}) => {
	const remarkPlugins = [
		remarkMath,
		remarkGfm,
		...(mdx ? [remarkMdx] : []),
		remarkMention,
		remarkFrontmatter,
		remarkWikiLink,
		remarkCallout,
		remarkObsidianCalloutBridge,
	] as any[]

	return [
		ObsidianEmbedPlugin,
		MarkdownPlugin.configure({
			options: {
				disallowedNodes: [KEYS.slashCommand],
				remarkPlugins,
				remarkStringifyOptions: {
					handlers: {
						...remarkObsidianCalloutStringifyHandlers,
						root: (
							node: MdastRoot,
							_parent: unknown,
							state: any,
							info: any,
						) => {
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
						serialize: (node: { data?: KVRow[] | Record<string, unknown> }) => {
							const record = rowsToRecord(node?.data)
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
						deserialize: (
							mdastNode: MdRootContent,
							_deco: unknown,
							_options: DeserializeMdOptions,
						) => {
							return {
								type: FRONTMATTER_KEY,
								data: parseFrontmatterYaml(
									"value" in mdastNode && typeof mdastNode.value === "string"
										? mdastNode.value
										: "",
								),
								children: [{ text: "" }],
							}
						},
					},
					[KEYS.link]: {
						serialize: (
							node: SlateNodeWithChildren & {
								url?: string
								wiki?: boolean
								wikiTarget?: string
							},
							options: SerializeMdOptions,
						): any => {
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
							const embedTarget =
								typeof node.embedTarget === "string"
									? node.embedTarget.trim()
									: ""

							if (embedTarget) {
								return {
									type: "paragraph",
									children: [
										{
											type: "embed",
											value: embedTarget,
											data: createEmbedNodeData(node.width, node.height),
										},
									],
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
					[OBSIDIAN_EMBED_KEY]: {
						serialize: (node: any) => {
							const embedTarget =
								typeof node.embedTarget === "string"
									? node.embedTarget.trim()
									: ""

							if (!embedTarget) {
								return { type: "text", value: "" }
							}

							return {
								type: "embed",
								value: embedTarget,
								data: createEmbedNodeData(node.width, node.height),
							}
						},
					},
					embed: {
						deserialize: (
							mdastNode: MdastNode,
							_deco: unknown,
							options: DeserializeMdOptions,
						) => {
							const target = mdastNode.value || ""
							const hName = mdastNode.data?.hName
							const hProperties = mdastNode.data?.hProperties ?? {}
							const url = hProperties.src || mdastNode.data?.path || target
							const { width, height } = getEmbedDimensions(mdastNode)

							if (hName === "img") {
								const altText =
									typeof hProperties.alt === "string" ? hProperties.alt : ""

								return {
									type: getPluginType(options.editor!, KEYS.img),
									url,
									embedTarget: target,
									width,
									height,
									caption: [{ text: altText }],
									children: [{ text: "" }],
								}
							}

							return {
								type: getPluginType(options.editor!, OBSIDIAN_EMBED_KEY),
								embedTarget: target,
								width,
								height,
								children: [{ text: "" }],
							}
						},
					},
					callout: calloutMarkdownRule,
					wikiLink: {
						serialize: (
							node: SlateNodeWithChildren & {
								url?: string
								wikiTarget?: string
							},
						) => {
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
						deserialize: (
							mdastNode: MdastNode,
							_deco: unknown,
							_options: DeserializeMdOptions,
						) => {
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
}

export const MarkdownKit = createMarkdownKit()
export const MarkdownKitNoMdx = createMarkdownKit({ mdx: false })
