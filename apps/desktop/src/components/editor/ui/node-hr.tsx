import type { PlateElementProps } from "platejs/react"

import {
	PlateElement,
	useFocused,
	useReadOnly,
	useSelected,
} from "platejs/react"

import { cn } from "@/lib/utils"

export function HrElement(props: PlateElementProps) {
	const readOnly = useReadOnly()
	const selected = useSelected()
	const focused = useFocused()

	return (
		<PlateElement {...props}>
			<div className="py-6" contentEditable={false}>
				<hr
					className={cn(
						"h-[1px] border-none bg-primary/20 bg-clip-content",
						selected && focused && "bg-brand/10 ring-5 ring-brand/10",
						!readOnly && "cursor-pointer",
					)}
				/>
			</div>
			{props.children}
		</PlateElement>
	)
}
