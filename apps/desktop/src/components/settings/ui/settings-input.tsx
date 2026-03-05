import { Input } from "@mdit/ui/components/input"
import { cn } from "@mdit/ui/lib/utils"
import type * as React from "react"

export type SettingsInputProps = React.ComponentProps<typeof Input>

export function SettingsInput({ className, ...props }: SettingsInputProps) {
	return (
		<Input
			className={cn("h-7 rounded-sm px-2 text-sm", className)}
			{...props}
		/>
	)
}
