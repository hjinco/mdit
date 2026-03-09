import {
	convertChildrenDeserialize,
	convertNodesSerialize,
	type MdDecoration,
	type MdRootContent,
} from "@platejs/markdown"
import { type Descendant, getPluginType, KEYS } from "platejs"
import {
	formatObsidianCalloutDirective,
	isGeneratedCalloutTitle,
	normalizeObsidianCalloutData,
	type ObsidianCalloutData,
} from "../callout/obsidian-callout"
import { getPlainText } from "./markdown-utils"

type MdastRoot = {
	type: "root"
	children: MdastNode[]
}

type MdastNode = {
	type?: string
	name?: string
	children?: MdastNode[]
	calloutTitle?: string
	value?: string
	calloutType?: string
	defaultFolded?: boolean
	isFoldable?: boolean
	data?: {
		alias?: string
		hName?: string
		hProperties?: Record<string, unknown>
		path?: string
	}
}

type MdastCalloutNode = {
	type: "callout"
	children: MdastNode[]
	calloutTitle?: string
	calloutType?: string
	defaultFolded?: boolean
	isFoldable?: boolean
}

type SlateCalloutChildNode = Descendant & {
	calloutTitle?: boolean
	children?: Descendant[]
	text?: string
	type?: string
}

type SlateCalloutNode = ObsidianCalloutData & {
	children?: SlateCalloutChildNode[]
}

function createEmptyParagraphNode(): MdastNode {
	return {
		type: "paragraph",
		children: [{ type: "text", value: "" }],
	}
}

function ensureCalloutBodyChildren(
	children: MdastNode[] | undefined,
): MdastNode[] {
	if (children && children.length > 0) return children
	return [createEmptyParagraphNode()]
}

function getCalloutTitleChildren(node: MdastNode | undefined): MdastNode[] {
	if (!node) return []
	if (node.type === "paragraph") return [...(node.children ?? [])]

	if (
		node.type === "blockquote" &&
		node.children?.length === 1 &&
		node.children[0]?.type === "paragraph"
	) {
		return [...(node.children[0].children ?? [])]
	}

	return []
}

function getCalloutBodyNodes(node: MdastNode | undefined): MdastNode[] {
	if (!node) return []
	if (node.type === "blockquote") return [...(node.children ?? [])]
	return [node]
}

function isMdastCalloutBodyEmpty(children: MdastNode[] | undefined): boolean {
	if (!children || children.length === 0) return true

	return children.every((child) => {
		if (child.type !== "paragraph") return false
		if (!child.children || child.children.length === 0) return true

		return child.children.every((grandchild: MdastNode) => {
			if (grandchild.type !== "text") return false
			const value = typeof grandchild.value === "string" ? grandchild.value : ""
			return value.trim().length === 0
		})
	})
}

function isSlateCalloutBodyEmpty(children: Descendant[] | undefined): boolean {
	if (!children || children.length === 0) return true

	return children.every((child) => {
		if (!child || typeof child !== "object") return false
		const element = child as { type?: string; children?: unknown[] }
		if (element.type !== KEYS.p) return false
		if (!Array.isArray(element.children) || element.children.length === 0)
			return true

		return element.children.every((leaf) => {
			if (!leaf || typeof leaf !== "object") return false
			const text = (leaf as { text?: string }).text
			return typeof text === "string" && text.trim().length === 0
		})
	})
}

function createSlateCalloutTitleNode(
	type: string,
	title: string,
): SlateCalloutChildNode {
	return {
		calloutTitle: true,
		children: [{ text: title }],
		type,
	}
}

function splitSlateCalloutTitle(
	children: SlateCalloutChildNode[] | undefined,
): {
	bodyChildren: SlateCalloutChildNode[]
	calloutTitle?: string
} {
	if (!children || children.length === 0) {
		return { bodyChildren: [] }
	}

	const [firstChild, ...restChildren] = children
	if (!firstChild?.calloutTitle) {
		return {
			bodyChildren: children,
		}
	}

	const title = getPlainText(firstChild.children).trim()
	return {
		bodyChildren: restChildren,
		calloutTitle: title || undefined,
	}
}

function isObsidianCalloutNode(node: MdastNode | undefined): boolean {
	return Boolean(node?.data?.hProperties?.dataCallout)
}

function getNormalizedCalloutNodeData(
	node: ObsidianCalloutData | undefined,
): ObsidianCalloutData {
	const normalized = normalizeObsidianCalloutData(node)

	return {
		calloutTitle: normalized.calloutTitle,
		calloutType: normalized.calloutType,
		defaultFolded: normalized.defaultFolded,
		isFoldable: normalized.isFoldable,
	}
}

function normalizeObsidianCalloutBlockquotes(tree: MdastRoot) {
	const visitChildren = (children: MdastNode[] | undefined) => {
		if (!children) return

		for (const [index, child] of children.entries()) {
			if (isObsidianCalloutNode(child)) {
				const rawCalloutType =
					typeof child.data?.hProperties?.dataCalloutType === "string"
						? child.data.hProperties.dataCalloutType
						: "note"
				const [titleNode, bodyNode, ...rest] = child.children ?? []
				const title = getPlainText(getCalloutTitleChildren(titleNode)).trim()
				const nextChildren = [...getCalloutBodyNodes(bodyNode), ...rest]
				const isFoldable = child.data?.hName === "details"
				const defaultFolded = isFoldable
					? child.data?.hProperties?.open !== true
					: false
				const callout = getNormalizedCalloutNodeData({
					calloutTitle: isGeneratedCalloutTitle(title, rawCalloutType)
						? undefined
						: title,
					calloutType: rawCalloutType,
					defaultFolded,
					isFoldable,
				})

				visitChildren(nextChildren)

				children[index] = {
					type: "callout",
					calloutTitle: callout.calloutTitle,
					calloutType: callout.calloutType,
					defaultFolded: callout.defaultFolded,
					isFoldable: callout.isFoldable,
					children: isMdastCalloutBodyEmpty(nextChildren)
						? []
						: ensureCalloutBodyChildren(nextChildren),
				}
				continue
			}

			visitChildren(child.children)
		}
	}

	visitChildren(tree.children)
}

function calloutLineMap(line: string, _index: number, blank: boolean): string {
	return `>${blank ? "" : " "}${line}`
}

export function remarkObsidianCalloutBridge() {
	return (tree: MdastRoot) => {
		normalizeObsidianCalloutBlockquotes(tree)
	}
}

export const remarkObsidianCalloutStringifyHandlers = {
	callout: (
		node: MdastCalloutNode,
		_parent: unknown,
		state: any,
		info: any,
	) => {
		const bodyChildren = node.children ?? []
		const exit = state.enter("blockquote")
		const tracker = state.createTracker(info)

		tracker.move("> ")
		tracker.shift(2)
		const directive = formatObsidianCalloutDirective({
			calloutTitle: node.calloutTitle,
			calloutType: node.calloutType,
			defaultFolded: node.defaultFolded,
			isFoldable: node.isFoldable,
		})

		const body = !isMdastCalloutBodyEmpty(bodyChildren)
			? state.indentLines(
					state.containerFlow(
						{
							type: "root",
							children: bodyChildren,
						},
						tracker.current(),
					),
					calloutLineMap,
				)
			: ""

		exit()
		return body ? `> ${directive}\n${body}` : `> ${directive}`
	},
}

export const calloutMarkdownRule = {
	deserialize: (mdastNode: MdastNode, deco: MdDecoration, options: any) => {
		if (mdastNode.type !== "callout") {
			return {
				type: getPluginType(options.editor!, KEYS.p),
				children: [
					{ text: `<${mdastNode.name ?? "callout"}>\n` },
					...convertChildrenDeserialize(
						(mdastNode.children ?? []) as MdRootContent[],
						deco,
						options,
					),
					{ text: `\n</${mdastNode.name ?? "callout"}>` },
				],
			}
		}

		const paragraphType = getPluginType(options.editor!, KEYS.p)
		const bodyChildren =
			mdastNode.calloutTitle || !isMdastCalloutBodyEmpty(mdastNode.children)
				? (mdastNode.children ?? [])
				: ensureCalloutBodyChildren(mdastNode.children)
		const deserializedChildren = convertChildrenDeserialize(
			bodyChildren as MdRootContent[],
			deco,
			options,
		) as SlateCalloutChildNode[]
		const children = mdastNode.calloutTitle
			? [
					createSlateCalloutTitleNode(paragraphType, mdastNode.calloutTitle),
					...deserializedChildren,
				]
			: deserializedChildren
		const callout = getNormalizedCalloutNodeData(mdastNode)

		return {
			children,
			type: getPluginType(options.editor!, KEYS.callout),
			calloutType: callout.calloutType,
			defaultFolded: callout.defaultFolded,
			isFoldable: callout.isFoldable,
		}
	},
	serialize: (slateNode: SlateCalloutNode, options: any) => {
		const { bodyChildren, calloutTitle } = splitSlateCalloutTitle(
			slateNode.children,
		)
		const children = isSlateCalloutBodyEmpty(bodyChildren)
			? []
			: convertNodesSerialize(bodyChildren, options)
		const callout = getNormalizedCalloutNodeData(slateNode)

		return {
			calloutTitle,
			calloutType: callout.calloutType,
			defaultFolded: callout.defaultFolded,
			isFoldable: callout.isFoldable,
			children: children as any,
			type: "callout",
		}
	},
}
