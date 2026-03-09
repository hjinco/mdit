import { Button } from "@mdit/ui/components/button"
import { cn } from "@mdit/ui/lib/utils"
import type { TElement } from "platejs"
import {
	PlateElement,
	useEditorReadOnly,
	useEditorRef,
	useElement,
} from "platejs/react"
import { useState } from "react"

import { EmojiPopover } from "../emoji/emoji-toolbar-button"
import {
	normalizeObsidianCalloutData,
	OBSIDIAN_CALLOUT_TYPES,
	type ObsidianCalloutType,
} from "./obsidian-callout"

const EMOJI_FONT_FAMILY =
	'"Apple Color Emoji", "Segoe UI Emoji", NotoColorEmoji, "Noto Color Emoji", "Segoe UI Symbol", "Android Emoji", EmojiSymbols'

function CalloutTypePicker({
	currentType,
	onSelect,
}: {
	currentType: ObsidianCalloutType
	onSelect: (type: ObsidianCalloutType) => void
}) {
	return (
		<div
			className="w-56 max-h-80 rounded-xl border bg-popover px-1.5 py-1.5 overflow-y-auto overscroll-none shadow-md"
			contentEditable={false}
		>
			<div className="px-1 py-1 text-xs font-semibold text-muted-foreground">
				Callout type
			</div>
			<div className="flex flex-col gap-0.5">
				{OBSIDIAN_CALLOUT_TYPES.map(({ emoji, label, value }) => {
					const selected = currentType === value

					return (
						<Button
							key={value}
							type="button"
							variant="ghost"
							className={cn(
								"h-8 w-full justify-start gap-2 rounded-md px-2 py-1.5 text-sm font-normal",
								selected && "bg-accent text-accent-foreground",
							)}
							aria-label={label}
							aria-pressed={selected}
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => onSelect(value)}
						>
							<span
								className="text-base leading-none"
								style={{ fontFamily: EMOJI_FONT_FAMILY }}
							>
								{emoji}
							</span>
							<span className="truncate">{label}</span>
						</Button>
					)
				})}
			</div>
		</div>
	)
}

export function CalloutElement({
	attributes,
	children,
	className,
	...props
}: React.ComponentProps<typeof PlateElement>) {
	const editor = useEditorRef()
	const element = useElement() as TElement & {
		backgroundColor?: string
		calloutType?: string
	}
	const readOnly = useEditorReadOnly()
	const [isOpen, setIsOpen] = useState(false)
	const { calloutType: currentType, icon: currentEmoji } =
		normalizeObsidianCalloutData(element)

	const handleSelect = (type: ObsidianCalloutType) => {
		const path = editor.api.findPath(element)
		if (!path) return

		const nextCallout = normalizeObsidianCalloutData({
			...element,
			calloutType: type,
		})

		editor.tf.setNodes(
			{
				calloutType: nextCallout.calloutType,
			},
			{ at: path },
		)
		setIsOpen(false)
	}

	return (
		<PlateElement
			className={cn("my-1 flex rounded-sm bg-muted p-3", className)}
			style={{
				backgroundColor: element.backgroundColor,
			}}
			attributes={{
				...attributes,
				"data-plate-open-context-menu": true,
			}}
			{...props}
		>
			<div className="flex w-full items-start gap-2 rounded-md">
				<EmojiPopover
					isOpen={isOpen}
					setIsOpen={(open) => {
						if (!readOnly) setIsOpen(open)
					}}
					control={
						<Button
							variant="ghost"
							className="mt-1 size-6 p-1 text-[18px] select-none hover:bg-muted-foreground/15"
							style={{ fontFamily: EMOJI_FONT_FAMILY }}
							contentEditable={false}
							disabled={readOnly}
							onMouseDown={(event) => event.preventDefault()}
							aria-label="Select callout type"
						>
							{currentEmoji}
						</Button>
					}
				>
					<CalloutTypePicker
						currentType={currentType}
						onSelect={handleSelect}
					/>
				</EmojiPopover>
				<div className="w-full">{children}</div>
			</div>
		</PlateElement>
	)
}
