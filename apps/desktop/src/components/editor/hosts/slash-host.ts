import type { FrontmatterRow as KVRow } from "@mdit/editor/frontmatter"
import {
	createDefaultFrontmatterRows,
	createRowId,
	datePattern,
	type ValueType,
} from "@mdit/editor/frontmatter"
import type { SlashHostDeps } from "@mdit/editor/slash"
import { open } from "@tauri-apps/plugin-dialog"
import { readDir, readTextFile } from "@tauri-apps/plugin-fs"
import { dirname, resolve } from "pathe"
import YAML from "yaml"
import { useStore } from "@/store"
import { buildImageLinkData } from "../utils/image-link"

const MAX_REFERENCED_NOTES = 5

function detectValueType(value: unknown): ValueType | null {
	if (value instanceof Date) return "date"
	if (typeof value === "string" && datePattern.test(value)) return "date"

	if (typeof value === "boolean") return "boolean"
	if (typeof value === "number" && Number.isFinite(value)) return "number"
	if (Array.isArray(value)) return "array"
	if (value === null || value === undefined) return null
	if (typeof value === "string") return "string"

	return null
}

const frontmatterPattern = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

function extractFrontmatterSource(markdown: string): string | null {
	const trimmed = markdown.startsWith("\ufeff") ? markdown.slice(1) : markdown
	const match = frontmatterPattern.exec(trimmed)

	return match ? match[1] : null
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

type DesktopSlashHostRuntimeDeps = {
	openDialog: typeof open
	readDirectory: typeof readDir
	readMarkdownFile: typeof readTextFile
	getTabPath: () => string | null
	resolveImageLink: typeof buildImageLinkData
}

const defaultRuntimeDeps: DesktopSlashHostRuntimeDeps = {
	openDialog: open,
	readDirectory: readDir,
	readMarkdownFile: readTextFile,
	getTabPath: () => useStore.getState().tab?.path ?? null,
	resolveImageLink: buildImageLinkData,
}

export const createDesktopSlashHost = (
	runtimeDeps: DesktopSlashHostRuntimeDeps = defaultRuntimeDeps,
): SlashHostDeps => {
	const getFrontmatterDefaults = async (): Promise<KVRow[]> => {
		const tabPath = runtimeDeps.getTabPath()
		if (!tabPath) {
			return createDefaultFrontmatterRows()
		}

		try {
			const tabDir = dirname(tabPath)
			const entries = await runtimeDeps.readDirectory(tabDir)
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
						const content = await runtimeDeps.readMarkdownFile(
							entry.absolutePath,
						)
						const source = extractFrontmatterSource(content)
						if (!source) return

						const parsed = YAML.parse(source)
						if (
							!parsed ||
							typeof parsed !== "object" ||
							Array.isArray(parsed)
						) {
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
				.filter(
					(item): item is { key: string; type: ValueType } => item !== null,
				)
				.map(({ key, type }) => ({
					id: createRowId(),
					key,
					type,
					value: defaultValueForType(type),
				}))

			if (rows.length === 0) {
				return createDefaultFrontmatterRows()
			}

			return rows
		} catch {
			return createDefaultFrontmatterRows()
		}
	}

	return {
		pickImageFile: async () => {
			const path = await runtimeDeps.openDialog({
				multiple: false,
				directory: false,
				filters: [
					{
						name: "Images",
						extensions: ["jpg", "jpeg", "png", "gif", "webp"],
					},
				],
			})

			return typeof path === "string" ? path : null
		},
		resolveImageLink: (path: string) => runtimeDeps.resolveImageLink(path),
		getFrontmatterDefaults,
	}
}

export const desktopSlashHost = createDesktopSlashHost()
