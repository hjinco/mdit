import { Button } from "@mdit/ui/components/button"
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from "@mdit/ui/components/popover"
import { Separator } from "@mdit/ui/components/separator"
import {
	FloatingMedia as FloatingMediaPrimitive,
	FloatingMediaStore,
	useFloatingMediaValue,
	useImagePreviewValue,
} from "@platejs/media/react"
import { cva } from "class-variance-authority"
import { Link, Trash2Icon } from "lucide-react"
import type { WithRequiredKey } from "platejs"
import {
	useEditorRef,
	useEditorSelector,
	useElement,
	useFocusedLast,
	useReadOnly,
	useRemoveNodeButton,
	useSelected,
} from "platejs/react"
import { useEffect } from "react"
import { CaptionButton } from "./caption"

const inputVariants = cva(
	"flex h-[28px] w-full rounded-md border-none bg-transparent px-1.5 py-1 text-base placeholder:text-muted-foreground focus-visible:ring-transparent focus-visible:outline-none md:text-sm",
)

export function MediaToolbar({
	children,
	plugin,
	hide,
}: {
	children: React.ReactNode
	plugin: WithRequiredKey
	hide?: boolean
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
	const isEditing = useFloatingMediaValue("isEditing")
	const element = useElement()
	const { props: buttonProps } = useRemoveNodeButton({ element })

	const isWikiMedia = Boolean(
		(element as { wiki?: boolean; wikiTarget?: string }).wiki ||
			(element as { wiki?: boolean; wikiTarget?: string }).wikiTarget,
	)

	// biome-ignore lint/correctness/useExhaustiveDependencies: true
	useEffect(() => {
		if (!open && isEditing) {
			FloatingMediaStore.set("isEditing", false)
		}
	}, [open])

	return (
		<Popover open={open} modal={false}>
			<PopoverAnchor>{children}</PopoverAnchor>

			<PopoverContent
				className="w-auto p-1"
				onOpenAutoFocus={(e) => e.preventDefault()}
			>
				{isEditing ? (
					<div className="flex w-[330px] flex-col">
						<div className="flex items-center">
							<div className="flex items-center pr-1 pl-2 text-muted-foreground">
								<Link className="size-4" />
							</div>

							<FloatingMediaPrimitive.UrlInput
								className={inputVariants()}
								placeholder="Paste the embed link..."
								options={{ plugin }}
							/>
						</div>
					</div>
				) : (
					<div className="box-content flex items-center">
						{/* <FloatingMediaPrimitive.EditButton
              className={buttonVariants({ size: 'sm', variant: 'ghost' })}
            >
              Edit link
            </FloatingMediaPrimitive.EditButton> */}

						{!isWikiMedia && (
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
				)}
			</PopoverContent>
		</Popover>
	)
}
