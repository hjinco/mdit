import { Button } from "@mdit/ui/components/button"
import { cn } from "@mdit/ui/lib/utils"
import type * as React from "react"

export type SettingsButtonProps = React.ComponentProps<typeof Button> & {
	mode?: "compact" | "icon"
}

export function SettingsButton({
	mode = "compact",
	className,
	size,
	...props
}: SettingsButtonProps) {
	const resolvedSize = mode === "icon" ? "icon" : size

	return (
		<Button
			size={resolvedSize}
			className={cn(
				"rounded-sm text-sm h-7",
				mode === "icon" ? "size-7" : "px-2!",
				className,
			)}
			{...props}
		/>
	)
}
