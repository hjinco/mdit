export type FrontmatterFocusTarget = "firstCell" | "addButton"

type FrontmatterFocusEventDetail = {
	editorId: string
	target: FrontmatterFocusTarget
}

export const FRONTMATTER_FOCUS_EVENT = "mdit:frontmatter-focus"

const pendingFrontmatterFocusTargets = new Map<string, FrontmatterFocusTarget>()

export function requestFrontmatterFocus(
	editorId: string,
	target: FrontmatterFocusTarget,
) {
	pendingFrontmatterFocusTargets.set(editorId, target)

	if (typeof window === "undefined") return

	window.dispatchEvent(
		new CustomEvent<FrontmatterFocusEventDetail>(FRONTMATTER_FOCUS_EVENT, {
			detail: { editorId, target },
		}),
	)
}

export function takePendingFrontmatterFocusTarget(editorId: string) {
	const target = pendingFrontmatterFocusTargets.get(editorId) ?? null
	pendingFrontmatterFocusTargets.delete(editorId)
	return target
}
