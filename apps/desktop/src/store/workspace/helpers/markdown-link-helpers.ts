import remarkWikiLink from "@flowershow/remark-wiki-link"
import type { Definition, Image, Link } from "mdast"
import { normalize, relative, resolve } from "pathe"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { visit } from "unist-util-visit"

type Replacement = {
	start: number
	end: number
	text: string
}

type RewriteContext = {
	fromDir: string
	toDir: string
}

type TargetRewriteContext = {
	sourceDir: string
	oldTargetPath: string
	newTargetPath: string
}

type InlineTargetSlice = {
	start: number
	end: number
	rawTarget: string
}

const ABSOLUTE_PROTOCOL_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
const DRIVE_PATH_REGEX = /^[a-zA-Z]:[\\/]/
const WHITESPACE_REGEX = /\s/
const ESCAPABLE_CHARACTERS = new Set([
	"(",
	")",
	"[",
	"]",
	"{",
	"}",
	"<",
	">",
	'"',
	"'",
	" ",
	"\t",
	"\n",
	"\r",
	"\\",
])
const DESTINATION_ESCAPE_REGEX = /[()\s<>]/g

const remarkProcessor = unified().use(remarkParse)
const wikiRemarkProcessor = unified().use(remarkParse).use(remarkWikiLink)

export function rewriteMarkdownRelativeLinks(
	content: string,
	fromDir: string,
	toDir: string,
) {
	if (!content?.length || !fromDir || !toDir) {
		return content
	}

	const normalizedFrom = normalizeToPosix(fromDir)
	const normalizedTo = normalizeToPosix(toDir)

	if (normalizedFrom === normalizedTo) {
		return content
	}

	const tree = remarkProcessor.parse(content)
	const context: RewriteContext = {
		fromDir: normalizedFrom,
		toDir: normalizedTo,
	}

	const replacements: Replacement[] = []

	visit(tree, (node) => {
		if (node.type === "definition") {
			addDefinitionReplacement(node, content, context, replacements)
			return
		}

		if (node.type === "link" || node.type === "image") {
			addInlineReplacement(node, content, context, replacements)
		}
	})

	if (replacements.length === 0) {
		return content
	}

	replacements.sort((a, b) => a.start - b.start)
	let cursor = 0
	let result = ""

	for (const replacement of replacements) {
		if (replacement.start < cursor) {
			continue
		}

		result += content.slice(cursor, replacement.start)
		result += replacement.text
		cursor = replacement.end
	}

	result += content.slice(cursor)

	return result
}

export function rewriteMarkdownLinksForRenamedTarget(
	content: string,
	sourceDir: string,
	oldTargetPath: string,
	newTargetPath: string,
) {
	if (!content?.length || !sourceDir || !oldTargetPath || !newTargetPath) {
		return content
	}

	const normalizedSourceDir = normalizeToPosix(sourceDir)
	const normalizedOldTarget = normalizeToPosix(oldTargetPath)
	const normalizedNewTarget = normalizeToPosix(newTargetPath)

	if (normalizedOldTarget === normalizedNewTarget) {
		return content
	}

	const tree = remarkProcessor.parse(content)
	const context: TargetRewriteContext = {
		sourceDir: normalizedSourceDir,
		oldTargetPath: normalizedOldTarget,
		newTargetPath: normalizedNewTarget,
	}
	const replacements: Replacement[] = []

	visit(tree, (node) => {
		if (node.type === "definition") {
			addDefinitionReplacementForRenamedTarget(
				node,
				content,
				context,
				replacements,
			)
			return
		}

		if (node.type === "link" || node.type === "image") {
			addInlineReplacementForRenamedTarget(node, content, context, replacements)
		}
	})

	return applyReplacements(content, replacements)
}

type WikiLinkTargetSlice = {
	start: number
	end: number
	target: string
}

export function collectWikiLinkTargets(content: string): string[] {
	if (!content?.length) {
		return []
	}

	const uniqueTargets = new Set<string>()
	const slices = collectWikiLinkTargetSlices(content)
	for (const slice of slices) {
		uniqueTargets.add(slice.target)
	}

	return Array.from(uniqueTargets)
}

export function rewriteWikiLinkTargets(
	content: string,
	replacements: ReadonlyMap<string, string>,
) {
	if (!content?.length || replacements.size === 0) {
		return content
	}

	const targetSlices = collectWikiLinkTargetSlices(content)
	if (targetSlices.length === 0) {
		return content
	}

	const applied: Replacement[] = []

	for (const slice of targetSlices) {
		const replacement = replacements.get(slice.target)
		if (!replacement || replacement === slice.target) {
			continue
		}

		applied.push({
			start: slice.start,
			end: slice.end,
			text: replacement,
		})
	}

	return applyReplacements(content, applied)
}

function addInlineReplacement(
	node: Link | Image,
	source: string,
	context: RewriteContext,
	replacements: Replacement[],
) {
	const targetSlice = extractInlineTargetSlice(node, source)
	if (!targetSlice) {
		return
	}

	const replacement = buildReplacementForTarget(targetSlice.rawTarget, context)

	if (replacement && replacement !== targetSlice.rawTarget) {
		replacements.push({
			start: targetSlice.start,
			end: targetSlice.end,
			text: replacement,
		})
	}
}

function addInlineReplacementForRenamedTarget(
	node: Link | Image,
	source: string,
	context: TargetRewriteContext,
	replacements: Replacement[],
) {
	const targetSlice = extractInlineTargetSlice(node, source)
	if (!targetSlice) {
		return
	}

	const replacement = buildReplacementForRenamedTarget(
		targetSlice.rawTarget,
		context,
	)

	if (replacement && replacement !== targetSlice.rawTarget) {
		replacements.push({
			start: targetSlice.start,
			end: targetSlice.end,
			text: replacement,
		})
	}
}

function addDefinitionReplacement(
	node: Definition,
	source: string,
	context: RewriteContext,
	replacements: Replacement[],
) {
	const position = node.position
	if (!position?.start || !position.end) {
		return
	}

	const startOffset = position.start.offset
	const endOffset = position.end.offset

	if (startOffset == null || endOffset == null) {
		return
	}

	const rawNode = source.slice(startOffset, endOffset)
	const targetStart = findDefinitionTargetStart(rawNode)

	if (targetStart === -1) {
		return
	}

	const absoluteTargetStart = startOffset + targetStart
	const rawTarget = source.slice(absoluteTargetStart, endOffset)
	const replacement = buildReplacementForTarget(rawTarget, context)

	if (replacement && replacement !== rawTarget) {
		replacements.push({
			start: absoluteTargetStart,
			end: endOffset,
			text: replacement,
		})
	}
}

function addDefinitionReplacementForRenamedTarget(
	node: Definition,
	source: string,
	context: TargetRewriteContext,
	replacements: Replacement[],
) {
	const position = node.position
	if (!position?.start || !position.end) {
		return
	}

	const startOffset = position.start.offset
	const endOffset = position.end.offset

	if (startOffset == null || endOffset == null) {
		return
	}

	const rawNode = source.slice(startOffset, endOffset)
	const targetStart = findDefinitionTargetStart(rawNode)

	if (targetStart === -1) {
		return
	}

	const absoluteTargetStart = startOffset + targetStart
	const rawTarget = source.slice(absoluteTargetStart, endOffset)
	const replacement = buildReplacementForRenamedTarget(rawTarget, context)

	if (replacement && replacement !== rawTarget) {
		replacements.push({
			start: absoluteTargetStart,
			end: endOffset,
			text: replacement,
		})
	}
}

function extractInlineTargetSlice(
	node: Link | Image,
	source: string,
): InlineTargetSlice | null {
	const position = node.position
	if (!position?.start || !position.end) {
		return null
	}

	const startOffset = position.start.offset
	const endOffset = position.end.offset

	if (startOffset == null || endOffset == null) {
		return null
	}

	const rawNode = source.slice(startOffset, endOffset)

	if (rawNode.startsWith("<") && rawNode.endsWith(">")) {
		const targetStart = startOffset + 1
		const targetEnd = endOffset - 1
		const rawTarget = source.slice(targetStart, targetEnd)
		return {
			start: targetStart,
			end: targetEnd,
			rawTarget,
		}
	}

	const bracketIndex = findFirstSquareBracket(rawNode)
	if (bracketIndex === -1) {
		return null
	}

	const closingBracket = findClosingSquareBracket(rawNode, bracketIndex)
	if (closingBracket === -1) {
		return null
	}

	const openParenIndex = closingBracket + 1
	if (rawNode[openParenIndex] !== "(") {
		return null
	}

	const closingParenIndex = findClosingParenthesis(rawNode, openParenIndex)
	if (closingParenIndex === -1) {
		return null
	}

	const targetStartInNode = openParenIndex + 1
	const targetEndInNode = closingParenIndex

	return {
		start: startOffset + targetStartInNode,
		end: startOffset + targetEndInNode,
		rawTarget: rawNode.slice(targetStartInNode, targetEndInNode),
	}
}

function buildReplacementForTarget(rawTarget: string, context: RewriteContext) {
	const parsedTarget = splitTarget(rawTarget)

	if (!parsedTarget) {
		return null
	}

	const unwrappedDestination = decodeDestination(parsedTarget.destination)
	const { path: destinationPath, suffix } =
		splitDestinationSuffix(unwrappedDestination)

	if (!destinationPath || !shouldRewrite(destinationPath)) {
		return null
	}

	const normalizedTargetPath = normalizeForComputation(destinationPath)
	const absoluteTarget = normalizeToPosix(
		resolve(context.fromDir, normalizedTargetPath),
	)
	const stillValidFromNewLocation =
		absoluteTarget ===
		normalizeToPosix(resolve(context.toDir, normalizedTargetPath))

	if (stillValidFromNewLocation) {
		return null
	}

	let relativePathToTarget = relative(context.toDir, absoluteTarget)
	if (!relativePathToTarget) {
		relativePathToTarget = "."
	}

	const preferredBackslash =
		!parsedTarget.wrappedWithAngles &&
		shouldUseBackslash(parsedTarget.destination)

	const formattedRelativePath = preferredBackslash
		? relativePathToTarget.replace(/\//g, "\\")
		: toForwardSlash(relativePathToTarget)

	const newDestinationValue = formattedRelativePath + suffix
	const formattedDestination = parsedTarget.wrappedWithAngles
		? `<${newDestinationValue}>`
		: escapeDestination(newDestinationValue)

	return parsedTarget.leading + formattedDestination + parsedTarget.trailing
}

function buildReplacementForRenamedTarget(
	rawTarget: string,
	context: TargetRewriteContext,
) {
	const parsedTarget = splitTarget(rawTarget)

	if (!parsedTarget) {
		return null
	}

	const unwrappedDestination = decodeDestination(parsedTarget.destination)
	const { path: destinationPath, suffix } =
		splitDestinationSuffix(unwrappedDestination)

	if (!destinationPath || !shouldRewrite(destinationPath)) {
		return null
	}

	const normalizedTargetPath = normalizeForComputation(destinationPath)
	const absoluteTarget = normalizeToPosix(
		resolve(context.sourceDir, normalizedTargetPath),
	)

	if (absoluteTarget !== context.oldTargetPath) {
		return null
	}

	let relativePathToTarget = relative(context.sourceDir, context.newTargetPath)
	if (!relativePathToTarget) {
		relativePathToTarget = "."
	}

	const preferredBackslash =
		!parsedTarget.wrappedWithAngles &&
		shouldUseBackslash(parsedTarget.destination)
	const formattedRelativePath = preferredBackslash
		? relativePathToTarget.replace(/\//g, "\\")
		: toForwardSlash(relativePathToTarget)

	const newDestinationValue = formattedRelativePath + suffix
	const formattedDestination = parsedTarget.wrappedWithAngles
		? `<${newDestinationValue}>`
		: escapeDestination(newDestinationValue)

	return parsedTarget.leading + formattedDestination + parsedTarget.trailing
}

function applyReplacements(content: string, replacements: Replacement[]) {
	if (replacements.length === 0) {
		return content
	}

	replacements.sort((a, b) => a.start - b.start)
	let cursor = 0
	let result = ""

	for (const replacement of replacements) {
		if (replacement.start < cursor) {
			continue
		}

		result += content.slice(cursor, replacement.start)
		result += replacement.text
		cursor = replacement.end
	}

	result += content.slice(cursor)
	return result
}

function collectWikiLinkTargetSlices(content: string): WikiLinkTargetSlice[] {
	const slices: WikiLinkTargetSlice[] = []

	try {
		const tree = wikiRemarkProcessor.runSync(wikiRemarkProcessor.parse(content))

		visit(tree, (node) => {
			if (node.type === "wikiLink") {
				const slice = extractWikiLinkSlice(node, content)
				if (slice) {
					slices.push(slice)
				}
				return
			}

			if (node.type === "embed") {
				const slice = extractWikiEmbedSlice(node, content)
				if (slice) {
					slices.push(slice)
				}
			}
		})
	} catch (error) {
		console.error("Failed to parse markdown for wiki link collection:", error)
		return []
	}

	return slices
}

type OffsetNode = {
	position?: {
		start?: { offset?: number }
		end?: { offset?: number }
	}
}

type WikiValueNode = OffsetNode & {
	value?: string
}

function extractWikiLinkSlice(
	node: WikiValueNode,
	content: string,
): WikiLinkTargetSlice | null {
	const target = typeof node.value === "string" ? node.value : ""
	if (!target.length) {
		return null
	}

	const offsets = getOffsets(node)
	if (!offsets) {
		return null
	}

	const end = offsets.start + target.length
	if (end > content.length) {
		return null
	}

	return {
		start: offsets.start,
		end,
		target: content.slice(offsets.start, end),
	}
}

function extractWikiEmbedSlice(
	node: WikiValueNode,
	content: string,
): WikiLinkTargetSlice | null {
	const target = typeof node.value === "string" ? node.value : ""
	if (!target.length) {
		return null
	}

	const offsets = getOffsets(node)
	if (!offsets) {
		return null
	}

	const rawToken = content.slice(offsets.start, offsets.end)
	const openIndex = rawToken.indexOf("[[")
	if (openIndex === -1) {
		return null
	}

	const start = offsets.start + openIndex + 2
	const end = start + target.length
	if (end > offsets.end || end > content.length) {
		return null
	}

	return {
		start,
		end,
		target: content.slice(start, end),
	}
}

function getOffsets(node: OffsetNode) {
	const start = node.position?.start?.offset
	const end = node.position?.end?.offset

	if (start == null || end == null || end < start) {
		return null
	}

	return { start, end }
}

function findDefinitionTargetStart(value: string) {
	const closingLabelIndex = value.indexOf("]:")
	if (closingLabelIndex === -1) {
		return -1
	}

	let index = closingLabelIndex + 2

	while (index < value.length && WHITESPACE_REGEX.test(value[index]!)) {
		index += 1
	}

	return index
}

function findFirstSquareBracket(value: string) {
	for (let i = 0; i < value.length; i += 1) {
		if (value[i] === "[") {
			return i
		}
	}
	return -1
}

function splitDestinationSuffix(destination: string) {
	let path = destination
	let hash = ""
	let query = ""

	const hashIndex = path.indexOf("#")
	if (hashIndex !== -1) {
		hash = path.slice(hashIndex)
		path = path.slice(0, hashIndex)
	}

	const queryIndex = path.indexOf("?")
	if (queryIndex !== -1) {
		query = path.slice(queryIndex)
		path = path.slice(0, queryIndex)
	}

	return {
		path,
		suffix: query + hash,
	}
}

function shouldRewrite(destinationPath: string) {
	if (!destinationPath.trim()) {
		return false
	}

	if (destinationPath.startsWith("#") || destinationPath.startsWith("//")) {
		return false
	}

	if (ABSOLUTE_PROTOCOL_REGEX.test(destinationPath)) {
		return false
	}

	if (
		destinationPath.startsWith("/") ||
		destinationPath.startsWith("\\") ||
		DRIVE_PATH_REGEX.test(destinationPath)
	) {
		return false
	}

	return true
}

type ParsedTarget = {
	leading: string
	destination: string
	trailing: string
	wrappedWithAngles: boolean
}

function splitTarget(rawTarget: string): ParsedTarget | null {
	if (!rawTarget) {
		return null
	}

	let leadingEnd = 0
	while (
		leadingEnd < rawTarget.length &&
		WHITESPACE_REGEX.test(rawTarget[leadingEnd]!)
	) {
		leadingEnd += 1
	}

	const leading = rawTarget.slice(0, leadingEnd)
	const remainder = rawTarget.slice(leadingEnd)

	if (!remainder) {
		return null
	}

	if (remainder.startsWith("<")) {
		const closing = findClosingAngleBracket(remainder)
		if (closing === -1) {
			return null
		}

		return {
			leading,
			destination: remainder.slice(1, closing),
			trailing: remainder.slice(closing + 1),
			wrappedWithAngles: true,
		}
	}

	let destinationEnd = 0

	while (destinationEnd < remainder.length) {
		const char = remainder[destinationEnd]!

		if (char === "\\" && destinationEnd + 1 < remainder.length) {
			const next = remainder[destinationEnd + 1]!
			if (ESCAPABLE_CHARACTERS.has(next)) {
				destinationEnd += 2
				continue
			}
		}

		if (WHITESPACE_REGEX.test(char)) {
			break
		}

		destinationEnd += 1
	}

	const destination = remainder.slice(0, destinationEnd)
	const trailing = remainder.slice(destinationEnd)

	if (!destination) {
		return null
	}

	return {
		leading,
		destination,
		trailing,
		wrappedWithAngles: false,
	}
}

function decodeDestination(destination: string) {
	let result = ""

	for (let i = 0; i < destination.length; i += 1) {
		const char = destination[i]!
		const next = destination[i + 1]

		if (char === "\\" && next && ESCAPABLE_CHARACTERS.has(next)) {
			result += next
			i += 1
			continue
		}

		result += char
	}

	return result
}

function escapeDestination(destination: string) {
	return destination.replace(DESTINATION_ESCAPE_REGEX, (match) => `\\${match}`)
}

function findClosingAngleBracket(value: string) {
	for (let i = 1; i < value.length; i += 1) {
		const char = value[i]!
		const next = value[i + 1]

		if (char === "\\" && next && ESCAPABLE_CHARACTERS.has(next)) {
			i += 1
			continue
		}

		if (char === ">") {
			return i
		}
	}

	return -1
}

function findClosingSquareBracket(content: string, startIndex: number) {
	let depth = 0

	for (let i = startIndex; i < content.length; i += 1) {
		const char = content[i]!

		if (char === "\\") {
			i += 1
			continue
		}

		if (char === "[") {
			depth += 1
			continue
		}

		if (char === "]") {
			depth -= 1
			if (depth === 0) {
				return i
			}
		}
	}

	return -1
}

function findClosingParenthesis(content: string, openIndex: number) {
	let depth = 0
	let quoteChar: '"' | "'" | null = null

	for (let i = openIndex; i < content.length; i += 1) {
		const char = content[i]!

		if (i === openIndex) {
			depth = 1
			continue
		}

		if (quoteChar) {
			if (char === "\\" && content[i + 1] === quoteChar) {
				i += 1
				continue
			}

			if (char === quoteChar) {
				quoteChar = null
			}

			continue
		}

		if (char === "\\") {
			const next = content[i + 1]
			if (next && ESCAPABLE_CHARACTERS.has(next)) {
				i += 1
			}
			continue
		}

		if (char === '"' || char === "'") {
			quoteChar = char
			continue
		}

		if (char === "(") {
			depth += 1
			continue
		}

		if (char === ")") {
			depth -= 1
			if (depth === 0) {
				return i
			}
		}
	}

	return -1
}

function shouldUseBackslash(destination: string) {
	return destination.includes("\\") && !destination.includes("/")
}

function normalizeToPosix(value: string) {
	return toForwardSlash(normalize(value))
}

function normalizeForComputation(value: string) {
	return toForwardSlash(value)
}

function toForwardSlash(value: string) {
	return value.replace(/\\/g, "/")
}
