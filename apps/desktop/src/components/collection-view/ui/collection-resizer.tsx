import { Popover, PopoverContent } from "@mdit/ui/components/popover"
import { tooltipContentVariants } from "@mdit/ui/components/tooltip"
import { cn } from "@mdit/ui/lib/utils"
import { memo, useCallback, useRef, useState } from "react"
import { HotkeyKbd } from "@/components/hotkeys/hotkey-kbd"
import { useStore } from "@/store"

type CollectionResizerProps = {
	isOpen: boolean
	isResizing: boolean
	onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
}

export const CollectionResizer = memo(function CollectionResizer({
	isOpen,
	isResizing,
	onPointerDown,
}: CollectionResizerProps) {
	const toggleCollectionHotkey = useStore(
		(s) => s.hotkeys["toggle-collection-view"],
	)
	const [isPopoverOpen, setIsPopoverOpen] = useState(false)
	const [anchorPoint, setAnchorPoint] = useState<{
		x: number
		y: number
	} | null>(null)
	const anchorRef = useRef<HTMLSpanElement>(null)

	const updateAnchorPoint = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			const { clientX, clientY } = event
			setAnchorPoint({ x: clientX, y: clientY })
		},
		[],
	)

	const handlePointerDown = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			setIsPopoverOpen(false)
			onPointerDown(event)
		},
		[onPointerDown],
	)

	const handlePointerEnter = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			updateAnchorPoint(event)
			setIsPopoverOpen(true)
		},
		[updateAnchorPoint],
	)

	const handlePointerMove = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			if (!isPopoverOpen) return
			updateAnchorPoint(event)
		},
		[isPopoverOpen, updateAnchorPoint],
	)

	const handlePointerLeave = useCallback(() => {
		setIsPopoverOpen(false)
	}, [])

	if (!isOpen) {
		return null
	}

	return (
		<Popover
			modal={false}
			open={isPopoverOpen && Boolean(anchorPoint)}
			onOpenChange={(open) => {
				setIsPopoverOpen(open)
			}}
		>
			{anchorPoint && (
				<span
					ref={anchorRef}
					aria-hidden
					style={{
						position: "fixed",
						top: anchorPoint.y,
						left: anchorPoint.x,
						width: 0,
						height: 0,
						pointerEvents: "none",
					}}
				/>
			)}
			<div
				className="absolute top-0 -right-2 z-10 h-full w-4 cursor-col-resize bg-transparent"
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerEnter={handlePointerEnter}
				onPointerLeave={handlePointerLeave}
			/>
			{!isResizing && (
				<PopoverContent
					anchor={anchorRef}
					align="center"
					side="right"
					sideOffset={8}
					initialFocus={false}
					className={cn(tooltipContentVariants, "pr-1")}
				>
					<div className="flex items-center gap-1">
						Close
						<HotkeyKbd
							binding={toggleCollectionHotkey}
							kbdClassName="bg-background/20 text-background dark:bg-background/10"
						/>
					</div>
				</PopoverContent>
			)}
		</Popover>
	)
})
