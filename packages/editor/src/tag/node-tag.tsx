import { cn } from "@mdit/ui/lib/utils"
import { PlateLeaf, type PlateLeafProps } from "platejs/react"
import type { MouseEvent } from "react"

export type TagHostDeps = {
	openTagSearch: (query: string) => Promise<void> | void
}

type TagLeafText = {
	tag?: boolean
	tagLabel?: string
	tagQuery?: string
	text: string
}

type TagMouseEvent = Pick<
	MouseEvent<HTMLElement>,
	| "altKey"
	| "button"
	| "ctrlKey"
	| "metaKey"
	| "preventDefault"
	| "shiftKey"
	| "stopPropagation"
>

function canActivateTag(
	event: Pick<
		MouseEvent<HTMLElement>,
		"altKey" | "button" | "ctrlKey" | "metaKey" | "shiftKey"
	>,
	host: TagHostDeps | undefined,
	tagQuery: string | undefined,
) {
	return Boolean(
		host &&
			tagQuery &&
			event.button === 0 &&
			!event.altKey &&
			!event.ctrlKey &&
			!event.metaKey &&
			!event.shiftKey,
	)
}

export function handleTagMouseDown(
	event: TagMouseEvent,
	host: TagHostDeps | undefined,
	tagQuery: string | undefined,
) {
	if (!canActivateTag(event, host, tagQuery)) {
		return
	}

	event.preventDefault()
	event.stopPropagation()
}

export function handleTagClick(
	event: TagMouseEvent,
	host: TagHostDeps | undefined,
	tagQuery: string | undefined,
) {
	if (!canActivateTag(event, host, tagQuery)) {
		return
	}
	if (!host || !tagQuery) {
		return
	}

	event.preventDefault()
	event.stopPropagation()
	void Promise.resolve(host.openTagSearch(tagQuery)).catch((error) => {
		console.error("Failed to open tag search:", error)
	})
}

export function createTagLeaf(host?: TagHostDeps) {
	return function TagLeaf(props: PlateLeafProps<TagLeafText>) {
		const tagQuery = props.leaf.tagQuery
		const isInteractive = Boolean(host && tagQuery)

		return (
			<PlateLeaf {...props}>
				<span
					className={cn(
						"rounded-sm bg-brand/10 px-[0.18em] py-[0.04em] text-brand transition-colors",
						isInteractive && "cursor-pointer hover:bg-brand/18",
					)}
					onMouseDown={(event: MouseEvent<HTMLSpanElement>) =>
						handleTagMouseDown(event, host, tagQuery)
					}
					onClick={(event: MouseEvent<HTMLSpanElement>) =>
						handleTagClick(event, host, tagQuery)
					}
				>
					{props.children}
				</span>
			</PlateLeaf>
		)
	}
}
