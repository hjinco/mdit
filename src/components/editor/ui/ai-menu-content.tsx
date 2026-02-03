import { Command as CommandPrimitive } from "cmdk"
import { ArrowUpIcon, Loader2Icon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/ui/button"
import { Command, CommandList } from "@/ui/command"
import type { Command as TCommand } from "../hooks/use-ai-commands"
import { AIMenuItems } from "./ai-menu-items"
import { AIModelSelector } from "./ai-model-selector"

type EditorChatState = "cursorCommand" | "cursorSuggestion" | "selectionCommand"

const MAX_VISIBLE_LINES = 4
interface AIMenuContentProps {
	chatConfig: {
		provider: string
		model: string
		apiKey: string
	} | null
	modelPopoverOpen: boolean
	isLoading: boolean
	messages: any[]
	commands: TCommand[]
	input: string
	value: string
	menuState: EditorChatState
	isLicenseValid: boolean
	onModelPopoverOpenChange: (open: boolean) => void
	onValueChange: (value: string) => void
	onInputChange: (value: string) => void
	onInputClick: () => void
	onInputKeyDown: (e: React.KeyboardEvent) => void
	onSubmit: () => void
	onAddCommandOpen: () => void
	onCommandRemove: (type: "selectionCommand", label: string) => void
}

export function AIMenuContent({
	chatConfig,
	modelPopoverOpen,
	isLoading,
	messages,
	commands,
	input,
	value,
	menuState,
	isLicenseValid,
	onModelPopoverOpenChange,
	onValueChange,
	onInputChange,
	onInputClick,
	onInputKeyDown,
	onSubmit,
	onAddCommandOpen,
	onCommandRemove,
}: AIMenuContentProps) {
	const textareaRef = useRef<HTMLTextAreaElement | null>(null)
	const [textareaLineCount, setTextareaLineCount] = useState(1)

	const adjustTextareaHeight = useCallback(() => {
		const textarea = textareaRef.current
		if (!textarea) return

		const computedStyle = window.getComputedStyle(textarea)
		const parsedLineHeight = Number.parseFloat(computedStyle.lineHeight)
		const parsedFontSize = Number.parseFloat(computedStyle.fontSize)
		const lineHeight =
			Number.isFinite(parsedLineHeight) && parsedLineHeight > 0
				? parsedLineHeight
				: Number.isFinite(parsedFontSize) && parsedFontSize > 0
					? parsedFontSize * 1.2
					: 16
		const padding =
			(Number.parseFloat(computedStyle.paddingTop) || 0) +
			(Number.parseFloat(computedStyle.paddingBottom) || 0)
		const border =
			(Number.parseFloat(computedStyle.borderTopWidth) || 0) +
			(Number.parseFloat(computedStyle.borderBottomWidth) || 0)

		const minHeight = Math.ceil(lineHeight) + padding + border
		const maxHeight =
			Math.ceil(lineHeight * MAX_VISIBLE_LINES) + padding + border

		textarea.style.height = "auto"
		let newHeight = textarea.scrollHeight
		newHeight = Math.max(newHeight, minHeight)
		newHeight = Math.min(newHeight, maxHeight)

		textarea.style.overflowY = newHeight >= maxHeight ? "auto" : "hidden"
		textarea.style.height = `${newHeight}px`

		const contentHeight = Math.max(newHeight - padding - border, lineHeight)
		const estimatedLines =
			lineHeight > 0 ? Math.round(contentHeight / lineHeight) : 1

		setTextareaLineCount(
			Math.min(Math.max(estimatedLines, 1), MAX_VISIBLE_LINES),
		)
	}, [])

	const handleShiftEnter = useCallback(
		(event: React.KeyboardEvent) => {
			if (event.key !== "Enter" || !event.shiftKey) {
				return false
			}

			event.preventDefault()

			const textarea = textareaRef.current
			if (!textarea) {
				return false
			}

			const selectionStart = textarea.selectionStart ?? textarea.value.length
			const selectionEnd =
				textarea.selectionEnd === null ? selectionStart : textarea.selectionEnd

			textarea.setRangeText("\n", selectionStart, selectionEnd, "end")
			textarea.dispatchEvent(new Event("input", { bubbles: true }))

			requestAnimationFrame(() => {
				textarea.setSelectionRange(selectionStart + 1, selectionStart + 1)
				adjustTextareaHeight()
			})

			return true
		},
		[adjustTextareaHeight],
	)

	const handleTextareaArrowNavigation = useCallback(
		(event: React.KeyboardEvent) => {
			if (value) {
				return false
			}

			if (textareaLineCount < 2) {
				return false
			}

			if (event.altKey || event.metaKey || event.ctrlKey) {
				return false
			}

			if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
				return false
			}

			const textarea = textareaRef.current
			if (!textarea || event.target !== textarea) {
				return false
			}

			const selectionStart = textarea.selectionStart ?? textarea.value.length
			const selectionEnd =
				textarea.selectionEnd === null ? selectionStart : textarea.selectionEnd

			if (event.key === "ArrowUp") {
				const precedingText = textarea.value.slice(0, selectionStart)
				if (!precedingText.includes("\n")) {
					return false
				}
			} else {
				const followingText = textarea.value.slice(selectionEnd)
				if (!followingText.includes("\n")) {
					return false
				}
			}

			event.stopPropagation()

			const nativeEvent = event.nativeEvent
			if ("stopImmediatePropagation" in nativeEvent) {
				nativeEvent.stopImmediatePropagation()
			}

			return true
		},
		[textareaLineCount, value],
	)

	// biome-ignore lint/correctness/useExhaustiveDependencies: true
	useEffect(() => {
		if (!isLoading) {
			adjustTextareaHeight()
		}
	}, [input, isLoading, adjustTextareaHeight])

	const canSubmit = Boolean(
		chatConfig && !isLoading && !value && isLicenseValid,
	)
	const isSingleLine = textareaLineCount <= 1

	return (
		<Command
			className="w-full h-auto overflow-visible bg-transparent"
			onValueChange={onValueChange}
			value={value}
		>
			{isLoading ? (
				<div className="flex grow select-none items-center gap-2 p-2 text-muted-foreground text-sm">
					<Loader2Icon className="size-4 animate-spin" />
					{messages.length > 1 ? "Editing..." : "Thinking..."}
				</div>
			) : (
				<div
					className={cn(
						"flex rounded-lg border transition-shadow bg-popover/90 backdrop-blur-xs",
						value ? "shadow-xs" : "shadow-xl",
						isSingleLine ? "flex-row items-center" : "flex-col",
					)}
				>
					<CommandPrimitive.Input
						asChild
						autoFocus
						data-plate-focus
						onClick={onInputClick}
						onKeyDown={(event) => {
							const handledShiftEnter = handleShiftEnter(event)
							const handledTextareaArrowNavigation =
								handleTextareaArrowNavigation(event)
							onInputKeyDown(event)
							if (handledShiftEnter || handledTextareaArrowNavigation) {
								return
							}
						}}
						onValueChange={onInputChange}
						placeholder={
							isLicenseValid
								? chatConfig
									? "Ask AI anything..."
									: "Select a model to get started..."
								: "License key required"
						}
						value={input}
					>
						<textarea
							ref={textareaRef}
							disabled={!isLicenseValid}
							className={cn(
								"w-full h-auto overflow-visible min-w-0 resize-none px-3 py-2 text-sm outline-none transition-[color,box-shadow,height] placeholder:text-muted-foreground",
								"aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
								"focus-visible:ring-transparent leading-relaxed box-border",
								!chatConfig && "cursor-pointer",
								isSingleLine && "flex-1",
								!isLicenseValid && "cursor-not-allowed opacity-50",
							)}
							rows={1}
							data-plate-focus
							onInput={adjustTextareaHeight}
						/>
					</CommandPrimitive.Input>

					<div className="flex items-center justify-end gap-2 pr-2">
						<AIModelSelector
							modelPopoverOpen={modelPopoverOpen}
							onModelPopoverOpenChange={onModelPopoverOpenChange}
						/>
						<Button
							type="button"
							size="icon"
							className="size-6 rounded-full"
							disabled={!canSubmit}
							onClick={() => {
								if (!canSubmit) return
								onSubmit()
							}}
						>
							<ArrowUpIcon />
						</Button>
					</div>
				</div>
			)}

			{!isLoading && (
				<CommandList
					className={cn(
						"rounded-lg border shadow-xl mt-2 z-40 bg-popover/90 backdrop-blur-xs",
						!value && "opacity-0",
					)}
				>
					<AIMenuItems
						commands={commands}
						input={input}
						setInput={onInputChange}
						setValue={onValueChange}
						disabled={!chatConfig || !isLicenseValid}
						menuState={menuState}
						onAddCommandOpen={onAddCommandOpen}
						onCommandRemove={onCommandRemove}
					/>
				</CommandList>
			)}
		</Command>
	)
}
