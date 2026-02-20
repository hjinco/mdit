import { cn } from "@mdit/ui/lib/utils"
import {
	type FloatingToolbarState,
	flip,
	offset,
	useFloatingToolbar,
	useFloatingToolbarState,
} from "@platejs/floating"
import { useComposedRef } from "@udecode/cn"
import { KEYS } from "platejs"
import {
	useEditorId,
	useEditorSelector,
	useEventEditorValue,
	usePluginOption,
} from "platejs/react"

import { Toolbar } from "./toolbar"

export function FloatingToolbar({
	children,
	className,
	state,
	...props
}: React.ComponentProps<typeof Toolbar> & {
	state?: FloatingToolbarState
}) {
	const editorId = useEditorId()
	const focusedEditorId = useEventEditorValue("focus")
	const hideInCodeBlock = useEditorSelector((editor) => {
		if (!editor.selection) return false

		return editor.api.some({
			at: editor.selection,
			match: { type: editor.getType(KEYS.codeBlock) },
		})
	}, [])
	const isFloatingLinkOpen = !!usePluginOption({ key: KEYS.link }, "mode")
	const isAIChatOpen = usePluginOption({ key: KEYS.aiChat }, "open")

	const floatingToolbarState = useFloatingToolbarState({
		editorId,
		focusedEditorId,
		hideToolbar: isFloatingLinkOpen || isAIChatOpen || hideInCodeBlock,
		...state,
		floatingOptions: {
			middleware: [
				offset(12),
				flip({
					fallbackPlacements: [
						"top-start",
						"top-end",
						"bottom-start",
						"bottom-end",
					],
					padding: 12,
				}),
			],
			placement: "top",
			...state?.floatingOptions,
		},
	})

	const {
		clickOutsideRef,
		hidden,
		props: rootProps,
		ref: floatingRef,
	} = useFloatingToolbar(floatingToolbarState)

	const side = (() => {
		const [rawSide] = floatingToolbarState.floating.placement.split("-")
		return rawSide === "top" || rawSide === "bottom" ? rawSide : "top"
	})()

	const ref = useComposedRef<HTMLDivElement>(props.ref, floatingRef)

	if (hidden) return null

	return (
		<div ref={clickOutsideRef}>
			<Toolbar
				{...props}
				{...rootProps}
				ref={ref}
				data-side={side}
				className={cn(
					"absolute z-50 scrollbar-hide overflow-x-auto rounded-md border bg-popover/90 backdrop-blur-xs p-0.5 whitespace-nowrap opacity-100 shadow-md print:hidden",
					"animate-in fade-in-0 zoom-in-95 data-[side=top]:slide-in-from-bottom-2 data-[side=bottom]:slide-in-from-top-2 motion-reduce:animate-none",
					"max-w-[80vw]",
					className,
				)}
			>
				{children}
			</Toolbar>
		</div>
	)
}
