import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs"
import { parse, stringify } from "yaml"

const FRONTMATTER_REGEX = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

type ParsedFrontmatter = {
	frontmatter: Record<string, unknown>
	body: string
	hasFrontmatter: boolean
}

function parseMarkdownFrontmatter(content: string): ParsedFrontmatter {
	const match = FRONTMATTER_REGEX.exec(content)
	if (!match) {
		return { frontmatter: {}, body: content, hasFrontmatter: false }
	}

	try {
		const parsed = parse(match[1])
		const frontmatter =
			parsed && typeof parsed === "object" && !Array.isArray(parsed)
				? (parsed as Record<string, unknown>)
				: {}

		return {
			frontmatter,
			body: content.slice(match[0].length),
			hasFrontmatter: true,
		}
	} catch (error) {
		throw new Error(`Failed to parse frontmatter: ${String(error)}`)
	}
}

function formatFrontmatterBlock(frontmatter: Record<string, unknown>): string {
	const yaml = stringify(frontmatter)
	const yamlBody = yaml === "{}\n" ? "" : yaml
	return `---\n${yamlBody}---\n`
}

function buildMarkdownWithFrontmatter(
	body: string,
	frontmatter: Record<string, unknown>,
) {
	const normalizedBody = body.startsWith("\n") ? body.slice(1) : body
	return `${formatFrontmatterBlock(frontmatter)}${normalizedBody}`
}

/**
 * Updates the frontmatter of a markdown file at the given path.
 * @param path The absolute path to the markdown file.
 * @param updates A partial object containing frontmatter keys to update or remove (set to undefined to remove).
 */
export async function updateFileFrontmatter(
	path: string,
	updates: Record<string, unknown>,
) {
	const content = await readTextFile(path)
	const parsed = parseMarkdownFrontmatter(content)

	const nextFrontmatter: Record<string, unknown> = { ...parsed.frontmatter }
	for (const [key, value] of Object.entries(updates)) {
		if (value === undefined) {
			delete nextFrontmatter[key]
		} else {
			nextFrontmatter[key] = value
		}
	}

	if (!parsed.hasFrontmatter && Object.keys(nextFrontmatter).length === 0) {
		return false
	}

	const nextContent = buildMarkdownWithFrontmatter(parsed.body, nextFrontmatter)
	await writeTextFile(path, nextContent)
	return true
}

/**
 * Renames a frontmatter property in a markdown file.
 */
export async function renameFileFrontmatterProperty(
	path: string,
	oldKey: string,
	newKey: string,
) {
	const content = await readTextFile(path)
	const parsed = parseMarkdownFrontmatter(content)

	if (!parsed.hasFrontmatter) return false

	if (Object.hasOwn(parsed.frontmatter, oldKey)) {
		const nextFrontmatter = { ...parsed.frontmatter }
		nextFrontmatter[newKey] = nextFrontmatter[oldKey]
		delete nextFrontmatter[oldKey]

		const nextContent = buildMarkdownWithFrontmatter(
			parsed.body,
			nextFrontmatter,
		)
		await writeTextFile(path, nextContent)
		return true
	}

	return false
}

/**
 * Removes a frontmatter property from a markdown file.
 */
export async function removeFileFrontmatterProperty(path: string, key: string) {
	return updateFileFrontmatter(path, { [key]: undefined })
}
