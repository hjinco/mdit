import { Button } from "@mdit/ui/components/button"
import { Popover, PopoverContent } from "@mdit/ui/components/popover"
import { Separator } from "@mdit/ui/components/separator"
import { useImagePreviewValue } from "@platejs/media/react"
import { Trash2Icon } from "lucide-react"
import {
	useEditorRef,
	useEditorSelector,
	useElement,
	useFocusedLast,
	useReadOnly,
	useRemoveNodeButton,
	useSelected,
} from "platejs/react"
import { useRef } from "react"
import { CaptionButton } from "./caption"

export function MediaToolbar({
	children,
	hide,
	toolbarContent,
	showCaption = true,
}: {
	children: React.ReactNode
	hide?: boolean
	toolbarContent?: React.ReactNode
	showCaption?: boolean
}) {
	const editor = useEditorRef()
	const readOnly = useReadOnly()
	const selected = useSelected()
	const isFocusedLast = useFocusedLast()
	const selectionCollapsed = useEditorSelector(
		(editor) => !editor.api.isExpanded(),
		[],
	)
	const isImagePreviewOpen = useImagePreviewValue("isOpen", editor.id)
	const open =
		isFocusedLast &&
		!readOnly &&
		selected &&
		selectionCollapsed &&
		!isImagePreviewOpen &&
		!hide
	const anchorRef = useRef<HTMLDivElement>(null)
	const element = useElement()
	const { props: buttonProps } = useRemoveNodeButton({ element })

	return (
		<Popover open={open} modal={false}>
			<div ref={anchorRef}>{children}</div>

			<PopoverContent
				anchor={anchorRef}
				className="w-auto p-1"
				initialFocus={false}
			>
				<div className="box-content flex items-center gap-1">
					{toolbarContent}

					{showCaption && (
						<>
							<CaptionButton size="sm" variant="ghost">
								Caption
							</CaptionButton>
							<Separator orientation="vertical" className="mx-1 h-6" />
						</>
					)}

					<Button size="sm" variant="ghost" {...buttonProps}>
						<Trash2Icon />
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	)
}
