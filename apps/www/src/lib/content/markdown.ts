import { toString as hastToString } from "hast-util-to-string"
import rehypeAutolinkHeadings from "rehype-autolink-headings"
import rehypeRaw from "rehype-raw"
import rehypeSlug from "rehype-slug"
import rehypeStringify from "rehype-stringify"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"
import { visit } from "unist-util-visit"

export interface ContentHeading {
	slug: string
	text: string
	depth: number
}

export interface RenderMarkdownResult {
	html: string
	headings: ContentHeading[]
}

export async function renderMarkdown(
	content: string,
): Promise<RenderMarkdownResult> {
	const headings: ContentHeading[] = []

	const result = await unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeRaw)
		.use(rehypeSlug)
		.use(rehypeAutolinkHeadings, {
			behavior: "wrap",
			properties: { className: ["anchor"] },
		})
		.use(() => (tree) => {
			visit(tree, "element", (node: any) => {
				if (!node?.tagName || !/^h[1-6]$/.test(node.tagName)) {
					return
				}

				const depth = Number(node.tagName.slice(1))
				const slug =
					typeof node.properties?.id === "string" ? node.properties.id : ""

				headings.push({
					slug,
					text: hastToString(node),
					depth,
				})
			})
		})
		.use(rehypeStringify)
		.process(content)

	return {
		html: String(result),
		headings,
	}
}
