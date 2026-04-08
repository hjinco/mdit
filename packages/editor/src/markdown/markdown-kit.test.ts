import { deserializeMd, serializeMd } from "@platejs/markdown"
import { createSlateEditor, KEYS } from "platejs"
import { describe, expect, it } from "vitest"
import { createNoteTitleBlock } from "../title"
import { MarkdownKit, MarkdownKitNoMdx } from "./markdown-kit"
import { OBSIDIAN_EMBED_KEY } from "./obsidian-embed-plugin"

type LocalStorageLike = Pick<
	Storage,
	"getItem" | "setItem" | "removeItem" | "clear" | "key"
> & {
	length: number
}

const ensureLocalStorage = () => {
	if (typeof globalThis.localStorage !== "undefined") return

	const store = new Map<string, string>()
	const localStorageShim: LocalStorageLike = {
		getItem: (key) => (store.has(key) ? store.get(key)! : null),
		setItem: (key, value) => {
			store.set(key, String(value))
		},
		removeItem: (key) => {
			store.delete(key)
		},
		clear: () => {
			store.clear()
		},
		key: (index) => Array.from(store.keys())[index] ?? null,
		get length() {
			return store.size
		},
	}

	globalThis.localStorage = localStorageShim as Storage
}

const createMarkdownEditor = ({ mdx = true }: { mdx?: boolean } = {}) => {
	ensureLocalStorage()
	return createSlateEditor({ plugins: mdx ? MarkdownKit : MarkdownKitNoMdx })
}

const findNodeByType = (nodes: any[], type: string): any | null => {
	for (const node of nodes) {
		if (!node) continue
		if (node.type === type) return node
		if (Array.isArray(node.children)) {
			const found = findNodeByType(node.children, type)
			if (found) return found
		}
	}
	return null
}

const extractText = (node: any): string => {
	if (!node) return ""
	if (typeof node.text === "string") return node.text
	if (Array.isArray(node.children))
		return node.children.map(extractText).join("")
	return ""
}

describe("markdown-kit serialization", () => {
	it("drops trailing empty paragraph on serialization", async () => {
		const editor = createMarkdownEditor()
		const value = [
			{
				type: KEYS.p,
				children: [{ text: "Hello" }],
			},
			{
				type: KEYS.p,
				children: [{ text: "" }],
			},
			{
				type: KEYS.p,
				children: [{ text: "" }],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toBe("Hello\n")
	})

	it("does not serialize editor-only title blocks", async () => {
		const editor = createMarkdownEditor()
		const value = [
			createNoteTitleBlock("Title"),
			{
				type: KEYS.p,
				children: [{ text: "Body" }],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toBe("Body\n")
	})

	it("serializes internal links as wiki links", async () => {
		const editor = createMarkdownEditor()
		const value = [
			{
				type: KEYS.p,
				children: [
					{ text: "See " },
					{
						type: KEYS.link,
						url: "./docs/guide.md",
						wiki: true,
						children: [{ text: "Guide" }],
					},
					{ text: "." },
				],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toContain("[[docs/guide|Guide]]")
	})

	it("serializes internal links as markdown when not wiki", async () => {
		const editor = createMarkdownEditor()
		const value = [
			{
				type: KEYS.p,
				children: [
					{ text: "See " },
					{
						type: KEYS.link,
						url: "./docs/guide.md",
						children: [{ text: "Guide" }],
					},
					{ text: "." },
				],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toContain("[Guide](./docs/guide.md)")
		expect(markdown).not.toContain("[[docs/guide|Guide]]")
	})

	it("serializes internal images as embeds", async () => {
		const editor = createMarkdownEditor()
		const value = [
			{
				type: KEYS.img,
				url: "assets/pic.png",
				embedTarget: "assets/pic.png",
				caption: [{ text: "Alt" }],
				children: [{ text: "" }],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toContain("![[assets/pic.png]]")
	})

	it("serializes internal image embeds with dimensions", async () => {
		const editor = createMarkdownEditor()
		const value = [
			{
				type: KEYS.img,
				url: "assets/pic.png",
				embedTarget: "assets/pic.png",
				width: 300,
				height: 200,
				children: [{ text: "" }],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toContain("![[assets/pic.png|300x200]]")
	})

	it("serializes internal image embeds with width only", async () => {
		const editor = createMarkdownEditor()
		const value = [
			{
				type: KEYS.img,
				url: "assets/pic.png",
				embedTarget: "assets/pic.png",
				width: 300,
				children: [{ text: "" }],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toContain("![[assets/pic.png|300]]")
	})

	it("serializes internal images as markdown when not embed", async () => {
		const editor = createMarkdownEditor()
		const value = [
			{
				type: KEYS.img,
				url: "./assets/pic.png",
				caption: [{ text: "Alt" }],
				children: [{ text: "" }],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toContain("![Alt](")
		expect(markdown).toContain("./assets/pic.png")
		expect(markdown).not.toContain("![[assets/pic.png]]")
	})

	it("does not serialize markdown images with resize dimensions", async () => {
		const editor = createMarkdownEditor()
		const value = [
			{
				type: KEYS.img,
				url: "./assets/pic.png",
				width: 300,
				caption: [{ text: "Alt" }],
				children: [{ text: "" }],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toContain("![Alt](")
		expect(markdown).toContain("./assets/pic.png")
		expect(markdown).not.toContain("|300")
	})

	it("serializes hidden embeds as embed syntax", async () => {
		const editor = createMarkdownEditor()
		const value = [
			{
				type: KEYS.p,
				children: [
					{ text: "See " },
					{
						type: OBSIDIAN_EMBED_KEY,
						embedTarget: "docs/guide",
						children: [{ text: "" }],
					},
					{ text: " now." },
				],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toContain("See ![[docs/guide]] now.")
	})

	it("serializes callouts as Obsidian block syntax", async () => {
		const editor = createMarkdownEditor()
		const value = [
			{
				type: KEYS.callout,
				calloutType: "tip",
				defaultFolded: false,
				isFoldable: true,
				children: [
					{
						type: KEYS.p,
						calloutTitle: true,
						children: [{ text: "Heads up" }],
					},
					{
						type: KEYS.p,
						children: [{ text: "Details" }],
					},
				],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toContain("> [!tip]+ Heads up")
		expect(markdown).toContain("> Details")
	})

	it("serializes multiline callout bodies with quoted blank lines", async () => {
		const editor = createMarkdownEditor()
		const value = [
			{
				type: KEYS.callout,
				calloutType: "warning",
				children: [
					{
						type: KEYS.p,
						children: [{ text: "First paragraph" }],
					},
					{
						type: KEYS.p,
						children: [{ text: "Second paragraph" }],
					},
				],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toContain("> [!warning]")
		expect(markdown).toContain("> First paragraph")
		expect(markdown).toContain(">\n> Second paragraph")
	})

	it("serializes title-only callouts without inventing a body", async () => {
		const editor = createMarkdownEditor()
		const value = [
			{
				type: KEYS.callout,
				calloutType: "info",
				children: [
					{
						type: KEYS.p,
						calloutTitle: true,
						children: [{ text: "Read me" }],
					},
				],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toBe("> [!info] Read me\n")
	})

	it("defaults callouts without a type to note", async () => {
		const editor = createMarkdownEditor()
		const value = [
			{
				type: KEYS.callout,
				children: [
					{
						type: KEYS.p,
						calloutTitle: true,
						children: [{ text: "Fallback" }],
					},
				],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toContain("> [!note] Fallback")
	})

	it("preserves exact supported types on serialization", async () => {
		const editor = createMarkdownEditor()
		const value = [
			{
				type: KEYS.callout,
				calloutType: "faq",
				children: [
					{
						type: KEYS.p,
						children: [{ text: "" }],
					},
				],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toContain("> [!faq]")
	})

	it("keeps external links in standard markdown", async () => {
		const editor = createMarkdownEditor()
		const value = [
			{
				type: KEYS.p,
				children: [
					{
						type: KEYS.link,
						url: "https://example.com",
						children: [{ text: "Example" }],
					},
				],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toContain("[Example](https://example.com)")
	})

	it("serializes equation blocks with environment wrappers", async () => {
		const editor = createMarkdownEditor()
		const value = [
			{
				type: KEYS.equation,
				environment: "equation",
				texExpression: "E=mc^2",
				children: [{ text: "" }],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toContain("\\begin{equation}")
		expect(markdown).toContain("E=mc^2")
		expect(markdown).toContain("\\end{equation}")
	})

	it("serializes canonical tags rows as a yaml list", async () => {
		const editor = createMarkdownEditor()
		const value = [
			{
				type: "frontmatter",
				data: [
					{
						id: "tags",
						key: "tags",
						type: "tags",
						value: ["#Project", "Docs/Guide"],
					},
				],
				children: [{ text: "" }],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toContain("tags:")
		expect(markdown).toContain("  - Project")
		expect(markdown).toContain("  - Docs/Guide")
		expect(markdown).not.toContain("#Project")
	})
})

describe("markdown-kit deserialization", () => {
	it("deserializes wiki links with aliases", async () => {
		const editor = createMarkdownEditor()
		const value = deserializeMd(editor, "[[docs/guide|Guide]]")
		const linkNode = findNodeByType(value as any[], KEYS.link)

		expect(linkNode).toMatchObject({
			type: KEYS.link,
			wiki: true,
			wikiTarget: "docs/guide",
		})
		expect(extractText(linkNode)).toBe("Guide")
	})

	it("deserializes markdown links as normal links", async () => {
		const editor = createMarkdownEditor()
		const value = deserializeMd(editor, "[Guide](./docs/guide.md)")
		const linkNode = findNodeByType(value as any[], KEYS.link)

		expect(linkNode).toMatchObject({
			type: KEYS.link,
			url: "./docs/guide.md",
		})
		expect(linkNode?.wiki).toBeUndefined()
		expect(linkNode?.wikiTarget).toBeUndefined()
	})

	it("deserializes embeds into image nodes", async () => {
		const editor = createMarkdownEditor()
		const value = deserializeMd(editor, "![[assets/pic.png]]")
		const imageNode = findNodeByType(value as any[], KEYS.img)

		expect(imageNode).toMatchObject({
			url: "assets/pic.png",
			embedTarget: "assets/pic.png",
		})
	})

	it("deserializes image embeds with dimensions", async () => {
		const editor = createMarkdownEditor()
		const value = deserializeMd(editor, "![[assets/pic.png|300x200]]")
		const imageNode = findNodeByType(value as any[], KEYS.img)

		expect(imageNode).toMatchObject({
			url: "assets/pic.png",
			embedTarget: "assets/pic.png",
			width: 300,
			height: 200,
		})
	})

	it("deserializes image embeds with width only", async () => {
		const editor = createMarkdownEditor()
		const value = deserializeMd(editor, "![[assets/pic.png|300]]")
		const imageNode = findNodeByType(value as any[], KEYS.img)

		expect(imageNode).toMatchObject({
			url: "assets/pic.png",
			embedTarget: "assets/pic.png",
			width: 300,
		})
		expect(imageNode?.height).toBeUndefined()
	})

	it("round-trips width-only image embeds", async () => {
		const editor = createMarkdownEditor()
		const initialValue = [
			{
				type: KEYS.img,
				url: "assets/pic.png",
				embedTarget: "assets/pic.png",
				width: 300,
				children: [{ text: "" }],
			},
		]

		const markdown = serializeMd(editor, { value: initialValue })
		const deserializedValue = deserializeMd(editor, markdown)
		const imageNode = findNodeByType(deserializedValue as any[], KEYS.img)

		expect(markdown).toContain("![[assets/pic.png|300]]")
		expect(imageNode).toMatchObject({
			url: "assets/pic.png",
			embedTarget: "assets/pic.png",
			width: 300,
		})
		expect(imageNode?.height).toBeUndefined()
	})

	it("deserializes non-image embeds into hidden nodes", async () => {
		const editor = createMarkdownEditor()
		const value = deserializeMd(editor, "See ![[docs/guide]] now.")
		const embedNode = findNodeByType(value as any[], OBSIDIAN_EMBED_KEY)

		expect(embedNode).toMatchObject({
			type: OBSIDIAN_EMBED_KEY,
			embedTarget: "docs/guide",
		})
	})

	it("deserializes frontmatter into rows", async () => {
		const editor = createMarkdownEditor()
		const value = deserializeMd(editor, "---\ntitle: Hello\n---\n\nBody")

		const frontmatterNode = value[0] as any
		expect(frontmatterNode?.type).toBe("frontmatter")
		expect(frontmatterNode?.data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: "title",
					value: "Hello",
					type: "string",
				}),
			]),
		)
	})

	it("deserializes frontmatter tags into the canonical tags type", async () => {
		const editor = createMarkdownEditor()
		const value = deserializeMd(
			editor,
			"---\ntags:\n  - '#Project'\n  - Docs/Guide\n---\n\nBody",
		)

		const frontmatterNode = value[0] as any
		expect(frontmatterNode?.type).toBe("frontmatter")
		expect(frontmatterNode?.data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: "tags",
					value: ["Project", "Docs/Guide"],
					type: "tags",
				}),
			]),
		)
	})

	it("deserializes equation blocks into equation nodes", async () => {
		const editor = createMarkdownEditor()
		const value = deserializeMd(
			editor,
			"$$\n\\begin{equation}\nE=mc^2\n\\end{equation}\n$$",
		)
		const equationNode = findNodeByType(value as any[], KEYS.equation)

		expect(equationNode).toMatchObject({
			type: KEYS.equation,
			environment: "equation",
			texExpression: "E=mc^2",
		})
	})

	it("deserializes Obsidian callouts into callout nodes", async () => {
		const editor = createMarkdownEditor()
		const value = deserializeMd(editor, "> [!warning] Watch out\n> Body")
		const calloutNode = findNodeByType(value as any[], KEYS.callout)

		expect(calloutNode).toMatchObject({
			type: KEYS.callout,
			calloutType: "warning",
		})
		expect(calloutNode?.children?.[0]).toMatchObject({
			type: KEYS.p,
			calloutTitle: true,
		})
		expect(extractText(calloutNode)).toContain("Body")
	})

	it("deserializes Obsidian callouts without MDX enabled", async () => {
		const editor = createMarkdownEditor({ mdx: false })
		const value = deserializeMd(editor, "> [!warning] Watch out\n> Body")
		const calloutNode = findNodeByType(value as any[], KEYS.callout)

		expect(calloutNode).toMatchObject({
			type: KEYS.callout,
			calloutType: "warning",
		})
		expect(calloutNode?.children?.[0]).toMatchObject({
			type: KEYS.p,
			calloutTitle: true,
		})
		expect(extractText(calloutNode)).toContain("Body")
	})

	it("preserves exact supported types on deserialize", async () => {
		const editor = createMarkdownEditor()
		const value = deserializeMd(editor, "> [!faq]\n> Body")
		const calloutNode = findNodeByType(value as any[], KEYS.callout)

		expect(calloutNode).toMatchObject({
			type: KEYS.callout,
			calloutType: "faq",
		})
	})

	it("normalizes unsupported types to note", async () => {
		const editor = createMarkdownEditor()
		const value = deserializeMd(editor, "> [!custom-type]\n> Body")
		const calloutNode = findNodeByType(value as any[], KEYS.callout)

		expect(calloutNode).toMatchObject({
			type: KEYS.callout,
			calloutType: "note",
		})
	})

	it("deserializes custom titles into callout children", async () => {
		const editor = createMarkdownEditor()
		const value = deserializeMd(
			editor,
			"> [!tip] Read this first\n> Then continue",
		)
		const calloutNode = findNodeByType(value as any[], KEYS.callout)

		expect(calloutNode).toMatchObject({ calloutType: "tip" })
		expect(calloutNode?.children?.[0]).toMatchObject({
			type: KEYS.p,
			calloutTitle: true,
		})
		expect(extractText(calloutNode?.children?.[0])).toBe("Read this first")
		expect(extractText(calloutNode)).toContain("Then continue")
	})

	it("deserializes fold markers into foldable state", async () => {
		const editor = createMarkdownEditor()
		const value = deserializeMd(editor, "> [!warning]- Hidden\n> Body")
		const calloutNode = findNodeByType(value as any[], KEYS.callout)

		expect(calloutNode).toMatchObject({
			calloutType: "warning",
			defaultFolded: true,
			isFoldable: true,
		})
		expect(calloutNode?.children?.[0]).toMatchObject({
			type: KEYS.p,
			calloutTitle: true,
		})
		expect(extractText(calloutNode?.children?.[0])).toBe("Hidden")
		expect(extractText(calloutNode)).toContain("Body")
	})

	it("round-trips fold markers and titles", async () => {
		const editor = createMarkdownEditor()
		const value = deserializeMd(editor, "> [!warning]- Hidden\n> Body")

		const markdown = serializeMd(editor, { value: value as any })
		expect(markdown).toContain("> [!warning]- Hidden")
		expect(markdown).toContain("> Body")
	})

	it("preserves nested callouts inside callout bodies", async () => {
		const editor = createMarkdownEditor()
		const value = [
			{
				type: KEYS.callout,
				calloutType: "note",
				children: [
					{
						type: KEYS.callout,
						calloutType: "warning",
						children: [
							{
								type: KEYS.p,
								children: [{ text: "Nested body" }],
							},
						],
					},
				],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toContain("> [!note]")
		expect(markdown).toContain("> > [!warning]")
		expect(markdown).toContain("> > Nested body")
	})
})

describe("markdown-kit invalid mdx input", () => {
	it("does not crash on invalid mdx when mdx mode is enabled", async () => {
		const editor = createMarkdownEditor()
		const value = deserializeMd(editor, "<callout icon={>Broken</callout>")
		expect(extractText(value[0] as any)).toContain("Broken")
	})

	it("treats invalid mdx syntax as plain text when mdx mode is disabled", async () => {
		const editor = createMarkdownEditor({ mdx: false })
		const value = deserializeMd(editor, "<callout icon={>Broken</callout>")

		expect(extractText(value[0] as any)).toContain("Broken")
	})
})

describe("markdown-kit legacy mdx callout input", () => {
	it("does not deserialize legacy mdx callout elements as callout nodes", async () => {
		const editor = createMarkdownEditor()
		const value = deserializeMd(editor, '<callout icon="💡">Body</callout>')
		const calloutNode = findNodeByType(value as any[], KEYS.callout)

		expect(calloutNode).toBeNull()
		expect(extractText(value[0] as any)).toContain("callout")
		expect(extractText(value[0] as any)).toContain("Body")
	})
})
