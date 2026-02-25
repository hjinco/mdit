import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import * as React from "react"
import { cn } from "../lib/utils"

type TooltipDefaults = {
	delay?: number
	closeDelay?: number
}

const TooltipDefaultsContext = React.createContext<TooltipDefaults>({})

type TooltipProviderProps = Omit<TooltipPrimitive.Provider.Props, "delay"> & {
	delayDuration?: number
	delay?: number
}

function TooltipProvider({
	delayDuration,
	delay = delayDuration ?? 300,
	...props
}: TooltipProviderProps) {
	return (
		<TooltipPrimitive.Provider
			data-slot="tooltip-provider"
			delay={delay}
			{...props}
		/>
	)
}

function Tooltip({
	delayDuration,
	closeDelay,
	...props
}: TooltipPrimitive.Root.Props & {
	delayDuration?: number
	closeDelay?: number
}) {
	const defaults = React.useMemo(
		() => ({ delay: delayDuration, closeDelay }),
		[closeDelay, delayDuration],
	)

	return (
		<TooltipProvider delay={delayDuration ?? 300} closeDelay={closeDelay}>
			<TooltipDefaultsContext.Provider value={defaults}>
				<TooltipPrimitive.Root data-slot="tooltip" {...props} />
			</TooltipDefaultsContext.Provider>
		</TooltipProvider>
	)
}

function TooltipTrigger({
	asChild,
	children,
	delay,
	closeDelay,
	...props
}: TooltipPrimitive.Trigger.Props & {
	asChild?: boolean
}) {
	const defaults = React.useContext(TooltipDefaultsContext)

	if (asChild) {
		return (
			<TooltipPrimitive.Trigger
				data-slot="tooltip-trigger"
				delay={delay ?? defaults.delay}
				closeDelay={closeDelay ?? defaults.closeDelay}
				render={children as React.ReactElement}
				{...props}
			/>
		)
	}

	return (
		<TooltipPrimitive.Trigger
			data-slot="tooltip-trigger"
			delay={delay ?? defaults.delay}
			closeDelay={closeDelay ?? defaults.closeDelay}
			{...props}
		>
			{children}
		</TooltipPrimitive.Trigger>
	)
}

export const tooltipContentVariants =
	"bg-background/90 text-foreground border shadow-xs animate-in fade-in-0 zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-9999 w-fit origin-(--transform-origin) rounded-sm px-2 py-1 text-xs text-balance"

type TooltipContentProps = TooltipPrimitive.Popup.Props &
	Pick<
		TooltipPrimitive.Positioner.Props,
		"align" | "alignOffset" | "side" | "sideOffset"
	> & {
		asChild?: boolean
	}

function TooltipContent({
	className,
	side = "top",
	align = "center",
	sideOffset = 0,
	alignOffset = 0,
	children,
	asChild,
	...props
}: TooltipContentProps) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Positioner
				data-slot="tooltip-positioner"
				side={side}
				align={align}
				sideOffset={sideOffset}
				alignOffset={alignOffset}
			>
				<TooltipPrimitive.Popup
					data-slot="tooltip-content"
					className={cn(tooltipContentVariants, className)}
					{...props}
					{...(asChild && React.isValidElement(children)
						? { render: children }
						: {})}
				>
					{!asChild ? children : null}
				</TooltipPrimitive.Popup>
			</TooltipPrimitive.Positioner>
		</TooltipPrimitive.Portal>
	)
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
