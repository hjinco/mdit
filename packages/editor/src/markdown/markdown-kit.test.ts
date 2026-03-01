import { deserializeMd, serializeMd } from "@platejs/markdown"
import { createSlateEditor, KEYS } from "platejs"
import { describe, expect, it } from "vitest"
import { MarkdownKit } from "./markdown-kit"

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

const createMarkdownEditor = async () => {
	ensureLocalStorage()
	return createSlateEditor({ plugins: MarkdownKit })
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
		const editor = await createMarkdownEditor()
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

	it("serializes internal links as wiki links", async () => {
		const editor = await createMarkdownEditor()
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
		const editor = await createMarkdownEditor()
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
		const editor = await createMarkdownEditor()
		const value = [
			{
				type: KEYS.img,
				url: "./assets/pic.png",
				wiki: true,
				caption: [{ text: "Alt" }],
				children: [{ text: "" }],
			},
		]

		const markdown = serializeMd(editor, { value })
		expect(markdown).toContain("![[assets/pic.png]]")
	})

	it("serializes internal images as markdown when not wiki", async () => {
		const editor = await createMarkdownEditor()
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

	it("keeps external links in standard markdown", async () => {
		const editor = await createMarkdownEditor()
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
		const editor = await createMarkdownEditor()
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
})

describe("markdown-kit deserialization", () => {
	it("deserializes wiki links with aliases", async () => {
		const editor = await createMarkdownEditor()
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
		const editor = await createMarkdownEditor()
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
		const editor = await createMarkdownEditor()
		const value = deserializeMd(editor, "![[assets/pic.png]]")
		const imageNode = findNodeByType(value as any[], KEYS.img)

		expect(imageNode).toMatchObject({
			url: "assets/pic.png",
			wiki: true,
			wikiTarget: "assets/pic.png",
		})
	})

	it("deserializes frontmatter into rows", async () => {
		const editor = await createMarkdownEditor()
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

	it("deserializes equation blocks into equation nodes", async () => {
		const editor = await createMarkdownEditor()
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
})
