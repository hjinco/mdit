import type { PlateLeafProps } from "platejs/react"
import { PlateLeaf } from "platejs/react"

export function CodeLeaf(props: PlateLeafProps) {
	return (
		<PlateLeaf
			{...props}
			as="code"
			className="rounded-sm bg-muted px-[0.3em] py-[0.2em] font-mono text-sm text-red-500 dark:text-red-400 whitespace-pre-wrap"
		>
			{props.children}
		</PlateLeaf>
	)
}
