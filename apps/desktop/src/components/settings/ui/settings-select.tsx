import {
	Select as BaseSelect,
	SelectContent as BaseSelectContent,
	SelectItem as BaseSelectItem,
	SelectTrigger as BaseSelectTrigger,
	SelectValue as BaseSelectValue,
} from "@mdit/ui/components/select"
import { cn } from "@mdit/ui/lib/utils"
import type * as React from "react"

export const Select = BaseSelect
export const SelectContent = BaseSelectContent
export const SelectItem = BaseSelectItem
export const SelectValue = BaseSelectValue

export type SettingsSelectTriggerProps = React.ComponentProps<
	typeof BaseSelectTrigger
>

export function SettingsSelectTrigger({
	className,
	...props
}: SettingsSelectTriggerProps) {
	return (
		<BaseSelectTrigger
			className={cn("h-7! rounded-sm px-2 text-sm", className)}
			{...props}
		/>
	)
}
