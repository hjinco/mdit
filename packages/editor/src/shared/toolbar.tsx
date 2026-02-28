import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"
import { Toolbar as ToolbarPrimitive } from "@base-ui/react/toolbar"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import {
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuSeparator,
} from "@mdit/ui/components/dropdown-menu"
import { Separator } from "@mdit/ui/components/separator"
import { cn } from "@mdit/ui/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import { ChevronDown } from "lucide-react"
import { useEffect, useState } from "react"

export function Toolbar({
	className,
	...props
}: React.ComponentProps<typeof ToolbarPrimitive.Root>) {
	return (
		<ToolbarPrimitive.Root
			className={cn("relative flex items-center select-none", className)}
			{...props}
		/>
	)
}

export function ToolbarToggleGroup({
	className,
	...props
}: React.ComponentProps<typeof ToggleGroupPrimitive>) {
	return (
		<ToggleGroupPrimitive
			className={cn("flex items-center", className)}
			{...props}
		/>
	)
}

export function ToolbarLink({
	className,
	...props
}: React.ComponentProps<typeof ToolbarPrimitive.Link>) {
	return (
		<ToolbarPrimitive.Link
			className={cn("font-medium underline underline-offset-4", className)}
			{...props}
		/>
	)
}

export function ToolbarSeparator({
	className,
	...props
}: React.ComponentProps<typeof ToolbarPrimitive.Separator>) {
	return (
		<ToolbarPrimitive.Separator
			className={cn("mx-2 my-1 w-px shrink-0 bg-border", className)}
			{...props}
		/>
	)
}

const toolbarButtonVariants = cva(
	"inline-flex items-center justify-center gap-2 rounded-md text-sm whitespace-nowrap text-foreground/80 transition-[color,box-shadow] outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-pressed:bg-accent data-pressed:text-accent-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
	{
		defaultVariants: {
			size: "default",
			variant: "default",
		},
		variants: {
			size: {
				default: "h-9 min-w-9 px-2",
				lg: "h-10 min-w-10 px-2.5",
				sm: "h-8 min-w-8 px-1.5",
			},
			variant: {
				default: "bg-transparent",
				outline:
					"border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
			},
		},
	},
)

const dropdownArrowVariants = cva(
	cn(
		"inline-flex items-center justify-center rounded-r-md text-sm font-medium text-foreground transition-colors disabled:pointer-events-none disabled:opacity-50",
	),
	{
		defaultVariants: {
			size: "sm",
			variant: "default",
		},
		variants: {
			size: {
				default: "h-9 w-6",
				lg: "h-10 w-8",
				sm: "h-8 w-4",
			},
			variant: {
				default:
					"bg-transparent hover:bg-muted hover:text-muted-foreground data-pressed:bg-accent data-pressed:text-accent-foreground",
				outline:
					"border border-l-0 border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
			},
		},
	},
)

type ToolbarButtonProps = {
	isDropdown?: boolean
	pressed?: boolean
} & React.ComponentPropsWithoutRef<"button"> &
	VariantProps<typeof toolbarButtonVariants>

export const ToolbarButton = withTooltip(function ToolbarButton({
	children,
	className,
	isDropdown,
	pressed,
	size = "sm",
	variant,
	...props
}: ToolbarButtonProps) {
	const { value, ...toggleProps } = props

	return typeof pressed === "boolean" ? (
		<ToolbarToggleItem
			pressed={pressed}
			value={typeof value === "string" ? value : undefined}
			className={cn(
				toolbarButtonVariants({
					size,
					variant,
				}),
				isDropdown && "justify-between gap-1 pr-1",
				className,
			)}
			{...toggleProps}
		>
			{isDropdown ? (
				<>
					<div className="flex flex-1 items-center gap-2 whitespace-nowrap">
						{children}
					</div>
					<div>
						<ChevronDown className="size-3.5 text-muted-foreground" data-icon />
					</div>
				</>
			) : (
				children
			)}
		</ToolbarToggleItem>
	) : (
		<ToolbarPrimitive.Button
			className={cn(
				toolbarButtonVariants({
					size,
					variant,
				}),
				isDropdown && "pr-1",
				className,
			)}
			{...props}
		>
			{children}
		</ToolbarPrimitive.Button>
	)
})

export function ToolbarSplitButton({
	className,
	...props
}: React.ComponentPropsWithoutRef<typeof ToolbarButton>) {
	return (
		<ToolbarButton
			className={cn("group flex gap-0 px-0 hover:bg-transparent", className)}
			{...props}
		/>
	)
}

type ToolbarSplitButtonPrimaryProps = Omit<
	React.ComponentPropsWithoutRef<typeof ToolbarToggleItem>,
	"value"
> &
	VariantProps<typeof toolbarButtonVariants>

export function ToolbarSplitButtonPrimary({
	children,
	className,
	size = "sm",
	variant,
	...props
}: ToolbarSplitButtonPrimaryProps) {
	return (
		<span
			className={cn(
				toolbarButtonVariants({
					size,
					variant,
				}),
				"rounded-r-none",
				"group-data-[pressed=true]:bg-accent group-data-[pressed=true]:text-accent-foreground",
				className,
			)}
			{...props}
		>
			{children}
		</span>
	)
}

export function ToolbarSplitButtonSecondary({
	className,
	size,
	variant,
	...props
}: React.ComponentPropsWithoutRef<"span"> &
	VariantProps<typeof dropdownArrowVariants>) {
	return (
		<button
			className={cn(
				dropdownArrowVariants({
					size,
					variant,
				}),
				"group-data-[pressed=true]:bg-accent group-data-[pressed=true]:text-accent-foreground",
				className,
			)}
			onClick={(e) => e.stopPropagation()}
			{...props}
		>
			<ChevronDown className="size-3.5 text-muted-foreground" data-icon />
		</button>
	)
}

export function ToolbarToggleItem({
	className,
	size = "sm",
	variant,
	...props
}: React.ComponentProps<typeof TogglePrimitive> &
	VariantProps<typeof toolbarButtonVariants>) {
	return (
		<TogglePrimitive
			className={cn(toolbarButtonVariants({ size, variant }), className)}
			{...props}
		/>
	)
}

export function ToolbarGroup({
	children,
	className,
}: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"group/toolbar-group",
				"relative hidden has-[button]:flex",
				className,
			)}
		>
			<div className="flex items-center">{children}</div>

			<div className="mx-1 py-0.5 group-last/toolbar-group:hidden!">
				<Separator orientation="vertical" />
			</div>
		</div>
	)
}

type TooltipProps<T extends React.ElementType> = {
	tooltip?: React.ReactNode
	tooltipContentProps?: Omit<
		React.ComponentPropsWithoutRef<typeof TooltipContent>,
		"children"
	>
	tooltipProps?: Omit<
		React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>,
		"children"
	>
	tooltipTriggerProps?: Omit<
		React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>,
		"children" | "render"
	>
} & React.ComponentProps<T>

function withTooltip<T extends React.ElementType>(Component: T) {
	return function ExtendComponent({
		tooltip,
		tooltipContentProps,
		tooltipProps,
		tooltipTriggerProps,
		...props
	}: TooltipProps<T>) {
		const [mounted, setMounted] = useState(false)

		useEffect(() => {
			setMounted(true)
		}, [])

		const component = <Component {...(props as React.ComponentProps<T>)} />

		if (tooltip && mounted) {
			return (
				<TooltipPrimitive.Root data-slot="tooltip" {...tooltipProps}>
					<TooltipPrimitive.Trigger
						data-slot="tooltip-trigger"
						render={component as React.ReactElement}
						{...tooltipTriggerProps}
					/>

					<TooltipContent {...tooltipContentProps}>{tooltip}</TooltipContent>
				</TooltipPrimitive.Root>
			)
		}

		return component
	}
}

function TooltipContent({
	children,
	className,
	sideOffset = 4,
	side = "top",
	align = "center",
	alignOffset = 0,
	...props
}: TooltipPrimitive.Popup.Props &
	Pick<
		TooltipPrimitive.Positioner.Props,
		"align" | "alignOffset" | "side" | "sideOffset"
	>) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Positioner
				side={side}
				align={align}
				sideOffset={sideOffset}
				alignOffset={alignOffset}
			>
				<TooltipPrimitive.Popup
					className={cn(
						"z-9999 w-fit origin-(--transform-origin) rounded-md bg-primary px-3 py-1.5 text-xs text-balance text-primary-foreground",
						className,
					)}
					data-slot="tooltip-content"
					{...props}
				>
					{children}
				</TooltipPrimitive.Popup>
			</TooltipPrimitive.Positioner>
		</TooltipPrimitive.Portal>
	)
}

export function ToolbarMenuGroup({
	children,
	className,
	label,
	...props
}: React.ComponentProps<typeof DropdownMenuRadioGroup> & { label?: string }) {
	return (
		<>
			<DropdownMenuSeparator
				className={cn(
					"hidden",
					"mb-0 shrink-0 peer-has-[[role=menuitem]]/menu-group:block peer-has-[[role=menuitemradio]]/menu-group:block peer-has-[[role=option]]/menu-group:block",
				)}
			/>

			<DropdownMenuRadioGroup
				{...props}
				className={cn(
					"hidden",
					"peer/menu-group group/menu-group my-1.5 has-[[role=menuitem]]:block has-[[role=menuitemradio]]:block has-[[role=option]]:block",
					className,
				)}
			>
				{label && (
					<DropdownMenuLabel className="text-xs font-semibold text-muted-foreground select-none">
						{label}
					</DropdownMenuLabel>
				)}
				{children}
			</DropdownMenuRadioGroup>
		</>
	)
}
