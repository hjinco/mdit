interface RenderedMarkdownProps {
	html: string
	className?: string
}

export function RenderedMarkdown({
	html,
	className = "content-body",
}: RenderedMarkdownProps) {
	return (
		<div
			className={className}
			// biome-ignore lint/security/noDangerouslySetInnerHtml: content is generated from local repository markdown during build.
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	)
}
