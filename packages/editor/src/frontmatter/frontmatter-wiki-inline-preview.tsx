import { type MouseEvent, useCallback, useMemo } from "react"
import { parseFrontmatterWikiSegments } from "./frontmatter-wiki-link-utils"

type FrontmatterWikiInlinePreviewProps = {
	value: string
	onOpenWikiLink?: (target: string) => void | Promise<void>
}

export function FrontmatterWikiInlinePreview({
	value,
	onOpenWikiLink,
}: FrontmatterWikiInlinePreviewProps) {
	const segments = useMemo(() => parseFrontmatterWikiSegments(value), [value])

	const handleWikiLinkMouseDown = useCallback(
		(event: MouseEvent<HTMLElement>, target: string) => {
			if (!onOpenWikiLink) return
			if (!(event.metaKey || event.ctrlKey)) return
			event.preventDefault()
			event.stopPropagation()
			void onOpenWikiLink(target)
		},
		[onOpenWikiLink],
	)

	return (
		<>
			{segments.map((segment, index) =>
				segment.type === "wikiLink" ? (
					<span
						key={`${segment.target}-${index}`}
						className="cursor-pointer text-primary underline underline-offset-2"
						onMouseDown={(event) =>
							handleWikiLinkMouseDown(event, segment.target)
						}
						onClick={(event) => {
							if (!(event.metaKey || event.ctrlKey)) return
							event.preventDefault()
							event.stopPropagation()
						}}
					>
						{segment.label}
					</span>
				) : (
					<span key={`${segment.value}-${index}`}>{segment.value}</span>
				),
			)}
		</>
	)
}
