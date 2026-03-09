import { Button as BaseButton } from "@base-ui/react/button"
import { cn } from "@mdit/ui/lib/utils"
import type { ComponentProps } from "react"

export function MediaOverlayButton({
	className,
	type = "button",
	...props
}: ComponentProps<typeof BaseButton>) {
	return (
		<BaseButton
			type={type}
			className={cn(
				"inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
				className,
			)}
			{...props}
		/>
	)
}
