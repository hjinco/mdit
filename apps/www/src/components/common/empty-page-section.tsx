interface EmptyPageSectionProps {
	className?: string
}

export function EmptyPageSection({
	className = "min-h-[40vh]",
}: EmptyPageSectionProps) {
	return <section className={className} />
}
