import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@mdit/ui/components/dropdown-menu"
import { AIChatPlugin } from "@platejs/ai/react"
import { unwrapLink, upsertLink } from "@platejs/link"
import {
	LinkPlugin,
	useLinkToolbarButton,
	useLinkToolbarButtonState,
} from "@platejs/link/react"
import { insertInlineEquation } from "@platejs/math"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import {
	BoldIcon,
	Code2Icon,
	ItalicIcon,
	KeyboardIcon,
	LinkIcon,
	MoreHorizontalIcon,
	RadicalIcon,
	SparklesIcon,
	StrikethroughIcon,
	SubscriptIcon,
	SuperscriptIcon,
	UnderlineIcon,
} from "lucide-react"
import { KEYS } from "platejs"
import {
	useEditorPlugin,
	useEditorReadOnly,
	useEditorRef,
	useMarkToolbarButton,
	useMarkToolbarButtonState,
} from "platejs/react"
import { useState } from "react"
import { ToolbarButton, ToolbarGroup } from "./toolbar"

export function FloatingToolbarButtons() {
	const editor = useEditorRef()
	const readOnly = useEditorReadOnly()
	const { api: aiApi } = useEditorPlugin(AIChatPlugin)
	const { api: linkApi } = useEditorPlugin(LinkPlugin)

	const state = useLinkToolbarButtonState()
	const { props: linkButtonProps } = useLinkToolbarButton(state)
	const { onClick: defaultLinkOnClick, ...restLinkButtonProps } =
		linkButtonProps

	const modifierKey =
		typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")
			? "⌘"
			: "Ctrl"

	return (
		<TooltipProvider>
			{!readOnly && (
				<>
					<ToolbarGroup>
						<ToolbarButton
							size="sm"
							tooltip={`${modifierKey}+J`}
							onClick={() => {
								aiApi.aiChat.show()
							}}
							onMouseDown={(e) => {
								e.preventDefault()
							}}
						>
							<SparklesIcon />
							Ask AI
						</ToolbarButton>
					</ToolbarGroup>

					<ToolbarGroup>
						<MarkToolbarButton
							size="sm"
							nodeType={KEYS.bold}
							tooltip={`Bold (${modifierKey}+B)`}
						>
							<BoldIcon />
						</MarkToolbarButton>

						<MarkToolbarButton
							size="sm"
							nodeType={KEYS.italic}
							tooltip={`Italic (${modifierKey}+I)`}
						>
							<ItalicIcon />
						</MarkToolbarButton>

						<MarkToolbarButton
							size="sm"
							nodeType={KEYS.underline}
							tooltip={`Underline (${modifierKey}+U)`}
						>
							<UnderlineIcon />
						</MarkToolbarButton>

						<MarkToolbarButton
							size="sm"
							nodeType={KEYS.strikethrough}
							tooltip={`Strikethrough (${modifierKey}+⇧+M)`}
						>
							<StrikethroughIcon />
						</MarkToolbarButton>

						<MarkToolbarButton
							size="sm"
							nodeType={KEYS.code}
							tooltip={`Code (${modifierKey}+E)`}
						>
							<Code2Icon />
						</MarkToolbarButton>

						<ToolbarButton
							size="sm"
							onClick={() => {
								insertInlineEquation(editor)
							}}
							tooltip="Mark as equation"
						>
							<RadicalIcon />
						</ToolbarButton>

						<ToolbarButton
							size="sm"
							data-plate-focus
							tooltip="Link"
							{...restLinkButtonProps}
							onClick={() => {
								if (state.pressed) {
									unwrapLink(editor)
								} else {
									const selectedText = editor.selection
										? editor.api.string(editor.selection).trim()
										: ""
									const seed = selectedText || ""
									const didUpsert = upsertLink(editor, {
										url: seed,
										text: selectedText || undefined,
										skipValidation: true,
									})

									if (!didUpsert) {
										defaultLinkOnClick?.()
										return
									}

									const linkEntry =
										editor.api.above({
											match: { type: editor.getType(KEYS.link) },
										}) ??
										editor.api.node({
											match: { type: editor.getType(KEYS.link) },
										})

									if (linkEntry) {
										const [, path] = linkEntry
										editor.tf.setNodes(
											{
												wiki: true,
												wikiTarget: seed || undefined,
											},
											{ at: path },
										)

										const end = editor.api.end(path)
										if (end) {
											editor.tf.select({ anchor: end, focus: end })
										}
									}

									linkApi.floatingLink.show("edit", editor.id)
								}
							}}
						>
							<LinkIcon />
						</ToolbarButton>
					</ToolbarGroup>
				</>
			)}

			<ToolbarGroup>{!readOnly && <MoreToolbarButton />}</ToolbarGroup>
		</TooltipProvider>
	)
}

function MarkToolbarButton({
	clear,
	nodeType,
	...props
}: React.ComponentProps<typeof ToolbarButton> & {
	nodeType: string
	clear?: string[] | string
}) {
	const state = useMarkToolbarButtonState({ clear, nodeType })
	const { props: buttonProps } = useMarkToolbarButton(state)
	return <ToolbarButton {...props} {...buttonProps} />
}

export function MoreToolbarButton() {
	const editor = useEditorRef()
	const [open, setOpen] = useState(false)

	return (
		<DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
			<DropdownMenuTrigger asChild>
				<ToolbarButton size="sm" pressed={open} tooltip="Insert">
					<MoreHorizontalIcon />
				</ToolbarButton>
			</DropdownMenuTrigger>

			<DropdownMenuContent
				className="ignore-click-outside/toolbar flex max-h-[500px] min-w-[180px] flex-col overflow-y-auto"
				align="start"
			>
				<DropdownMenuGroup>
					<DropdownMenuItem
						onSelect={() => {
							editor.tf.toggleMark(KEYS.kbd)
							editor.tf.collapse({ edge: "end" })
							editor.tf.focus()
						}}
					>
						<KeyboardIcon />
						Keyboard input
					</DropdownMenuItem>

					<DropdownMenuItem
						onSelect={() => {
							editor.tf.toggleMark(KEYS.sup, {
								remove: KEYS.sub,
							})
							editor.tf.focus()
						}}
					>
						<SuperscriptIcon />
						Superscript
						{/* (⌘+,) */}
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => {
							editor.tf.toggleMark(KEYS.sub, {
								remove: KEYS.sup,
							})
							editor.tf.focus()
						}}
					>
						<SubscriptIcon />
						Subscript
						{/* (⌘+.) */}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
