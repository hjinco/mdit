import { normalizeWikiTargetForDisplay } from "../link/link-toolbar-utils"
import {
	type FrontmatterWikiSegment,
	parseFrontmatterWikiSegments,
} from "./frontmatter-wiki-link-utils"

export type ResolveFrontmatterWikiLinkTarget = (
	rawTarget: string,
	fallbackTarget: string,
) => Promise<string>

function serializeFrontmatterSegment(segment: FrontmatterWikiSegment): string {
	if (segment.type === "text") {
		return segment.value
	}

	if (segment.label && segment.label !== segment.target) {
		return `[[${segment.target}|${segment.label}]]`
	}

	return `[[${segment.target}]]`
}

export async function resolveFrontmatterWikiLinks(
	value: string,
	resolveWikiLinkTarget?: ResolveFrontmatterWikiLinkTarget,
): Promise<string> {
	if (!resolveWikiLinkTarget || !value.includes("[[")) {
		return value
	}

	const segments = parseFrontmatterWikiSegments(value)
	if (!segments.some((segment) => segment.type === "wikiLink")) {
		return value
	}

	const cache = new Map<string, Promise<string>>()
	const resolveTarget = (rawTarget: string) => {
		const cached = cache.get(rawTarget)
		if (cached) {
			return cached
		}

		const fallbackTarget =
			normalizeWikiTargetForDisplay(rawTarget) || rawTarget.trim()
		const request = resolveWikiLinkTarget(rawTarget, fallbackTarget)
			.then((resolvedTarget) => resolvedTarget || fallbackTarget)
			.catch((error) => {
				console.warn(
					"Failed to resolve frontmatter wiki link via invoke; using fallback:",
					error,
				)
				return fallbackTarget
			})
		cache.set(rawTarget, request)
		return request
	}

	const resolvedSegments = await Promise.all(
		segments.map(async (segment) => {
			if (segment.type !== "wikiLink") {
				return segment
			}

			const resolvedTarget = await resolveTarget(segment.target)
			return {
				type: "wikiLink" as const,
				target: resolvedTarget,
				label:
					segment.label === segment.target ? resolvedTarget : segment.label,
			}
		}),
	)

	return resolvedSegments.map(serializeFrontmatterSegment).join("")
}
