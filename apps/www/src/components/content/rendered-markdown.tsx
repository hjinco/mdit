interface RenderedMarkdownProps {
	html: string
	className?: string
}

export function RenderedMarkdown({
	html,
	className = "content-body",
}: RenderedMarkdownProps) {
	return (
		<div className={className} dangerouslySetInnerHTML={{ __html: html }} />
	)
}
