import { useEquationInput } from "@platejs/math/react"
import katex, { type KatexOptions } from "katex"
import { CornerDownLeftIcon, RadicalIcon } from "lucide-react"
import type { TEquationElement } from "platejs"
import { PathApi } from "platejs"
import type { PlateElementProps } from "platejs/react"
import {
	createPrimitiveComponent,
	PlateElement,
	useEditorRef,
	useEditorSelector,
	useElement,
	useReadOnly,
	useSelected,
} from "platejs/react"
import { useCallback, useEffect, useRef, useState } from "react"
import TextareaAutosize, {
	type TextareaAutosizeProps,
} from "react-textarea-autosize"
import { cn } from "@/lib/utils"
import { Button } from "@/ui/button"
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover"
import { KATEX_ENVIRONMENTS } from "../utils/katex"

let katexJsPromise: Promise<typeof import("katex")> | null = null
let katexCssPromise: Promise<any> | null = null

const loadKatex = () => {
	if (!katexJsPromise) {
		katexJsPromise = import("katex")
	}
	if (!katexCssPromise) {
		katexCssPromise = import("katex/dist/katex.min.css")
	}
	return Promise.all([katexJsPromise, katexCssPromise]).then(
		([katexModule]) => katexModule,
	)
}

export function EquationElement(props: PlateElementProps<TEquationElement>) {
	const selected = useSelected()
	const [open, setOpen] = useState(selected)
	const katexRef = useRef<HTMLDivElement | null>(null)
	const editor = useEditorRef()
	const elementPathRef = useRef<ReturnType<typeof props.api.findPath>>(null)

	// Update element path ref when element changes
	const currentPath = props.api.findPath(props.element)
	if (
		currentPath &&
		(!elementPathRef.current ||
			!PathApi.equals(currentPath, elementPathRef.current))
	) {
		elementPathRef.current = currentPath
	}
	const elementPath = elementPathRef.current

	// Check if the current selection is within this equation element
	const isFocused = useEditorSelector((editor) => {
		const selection = editor.selection
		if (!selection || !elementPath) return false

		// Check if selection is within this element's path
		const blockEntry = editor.api.above({
			at: selection,
			match: editor.api.isBlock,
			mode: "lowest",
		})

		if (!blockEntry) return false

		const [, blockPath] = blockEntry
		return PathApi.equals(blockPath, elementPath)
	}, [])

	// Handle Enter key to open popover when element is focused
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
				// Check if still focused before opening
				const selection = editor.selection
				if (!selection || !elementPathRef.current) return

				const blockEntry = editor.api.above({
					at: selection,
					match: editor.api.isBlock,
					mode: "lowest",
				})

				if (!blockEntry) return

				const [, blockPath] = blockEntry
				if (PathApi.equals(blockPath, elementPathRef.current)) {
					e.preventDefault()
					e.stopPropagation()
					setOpen(true)
				}
			}
		},
		[editor],
	)

	useEffect(() => {
		if (!isFocused || open || !elementPath) return

		document.addEventListener("keydown", handleKeyDown)
		return () => {
			document.removeEventListener("keydown", handleKeyDown)
		}
	}, [isFocused, open, elementPath, handleKeyDown])

	useEquationElement({
		element: {
			...props.element,
		},
		katexRef,
		options: {
			displayMode: true,
			errorColor: "#cc0000",
			fleqn: false,
			leqno: false,
			macros: { "\\f": "#1f(#2)" },
			output: "htmlAndMathml",
			strict: "warn",
			throwOnError: false,
			trust: false,
		},
	})

	return (
		<PlateElement className="my-1" {...props}>
			<div className="relative group">
				<Popover open={open} onOpenChange={setOpen} modal={false}>
					<PopoverTrigger asChild>
						<div
							className={cn(
								"min-h-18 group flex cursor-pointer items-center justify-center rounded-sm select-none hover:bg-primary/10 data-[selected=true]:bg-primary/10",
								"w-full max-w-full min-w-0 overflow-x-auto",
								props.element.texExpression.length === 0
									? "bg-muted p-3 pr-9"
									: "px-2",
							)}
							data-selected={selected}
							contentEditable={false}
						>
							{props.element.texExpression.length > 0 ? (
								<span className="w-full px-6 overflow-x-auto" ref={katexRef} />
							) : (
								<div className="flex h-7 w-full items-center gap-2 text-sm whitespace-nowrap text-muted-foreground">
									<RadicalIcon className="size-6 text-muted-foreground/80" />
									<div>Add a Tex equation</div>
								</div>
							)}
						</div>
					</PopoverTrigger>

					<EquationPopoverContent
						open={open}
						placeholder={
							"f(x) = \\begin{cases}\n  x^2, &\\quad x > 0 \\\\\n  0, &\\quad x = 0 \\\\\n  -x^2, &\\quad x < 0\n\\end{cases}"
						}
						isInline={false}
						setOpen={setOpen}
					/>
				</Popover>

				<div
					className="absolute top-0.5 right-0.5 z-10 flex select-none opacity-0 transition-opacity group-hover:opacity-100"
					contentEditable={false}
				>
					<EquationEnvironmentCombobox
						onSelect={(environment) => {
							editor.tf.setNodes<TEquationElement>(
								{ environment },
								{ at: props.element },
							)
							editor.tf.focus()
						}}
					/>
				</div>
			</div>

			{props.children}
		</PlateElement>
	)
}

export function InlineEquationElement(
	props: PlateElementProps<TEquationElement>,
) {
	const element = props.element
	const katexRef = useRef<HTMLDivElement | null>(null)
	const selected = useSelected()
	const isCollapsed = useEditorSelector(
		(editor) => editor.api.isCollapsed(),
		[],
	)
	const [open, setOpen] = useState(selected && isCollapsed)

	useEffect(() => {
		if (selected && isCollapsed) {
			setOpen(true)
		}
	}, [selected, isCollapsed])

	useEquationElement({
		element,
		katexRef,
		options: {
			displayMode: true,
			errorColor: "#cc0000",
			fleqn: false,
			leqno: false,
			macros: { "\\f": "#1f(#2)" },
			output: "htmlAndMathml",
			strict: "warn",
			throwOnError: false,
			trust: false,
		},
	})

	return (
		<PlateElement
			{...props}
			className={cn(
				"mx-1 inline-block rounded-sm select-none [&_.katex-display]:my-0!",
			)}
		>
			<Popover open={open} onOpenChange={setOpen} modal={false}>
				<PopoverTrigger asChild>
					<div
						className={cn(
							'after:absolute after:inset-0 after:-top-0.5 after:-left-1 after:z-1 after:h-[calc(100%)+4px] after:w-[calc(100%+8px)] after:rounded-sm after:content-[""]',
							"h-6",
							((element.texExpression.length > 0 && open) || selected) &&
								"after:bg-brand/15",
							element.texExpression.length === 0 &&
								"text-muted-foreground after:bg-neutral-500/10",
						)}
						contentEditable={false}
					>
						<span
							ref={katexRef}
							className={cn(
								element.texExpression.length === 0 && "hidden",
								"font-mono leading-none",
							)}
						/>
						{element.texExpression.length === 0 && (
							<span>
								<RadicalIcon className="mr-1 inline-block h-[19px] w-4 py-[1.5px] align-text-bottom" />
								New equation
							</span>
						)}
					</div>
				</PopoverTrigger>

				<EquationPopoverContent
					className="my-auto"
					open={open}
					placeholder="E = mc^2"
					setOpen={setOpen}
					isInline
				/>
			</Popover>

			{props.children}
		</PlateElement>
	)
}

const EquationInput = createPrimitiveComponent(TextareaAutosize)({
	propsHook: useEquationInput,
})

const EquationPopoverContent = ({
	className,
	isInline,
	open,
	setOpen,
	...props
}: {
	isInline: boolean
	open: boolean
	setOpen: (open: boolean) => void
} & TextareaAutosizeProps) => {
	const editor = useEditorRef()
	const readOnly = useReadOnly()
	const element = useElement<TEquationElement>()

	useEffect(() => {
		if (isInline && open) {
			setOpen(true)
		}
	}, [isInline, open, setOpen])

	if (readOnly) return null

	const onClose = () => {
		if (isInline) {
			setOpen(false)
			editor.tf.select(element, { focus: true, next: true })
		} else {
			// Find the next block after the equation
			const nextNodeEntry = editor.api.next({ at: element, from: "after" })

			if (nextNodeEntry) {
				const [, nextPath] = nextNodeEntry
				setOpen(false)
				// Use setTimeout to ensure popover closes before setting selection
				setTimeout(() => {
					const startPoint = editor.api.start(nextPath)
					if (startPoint) {
						// Select only the start position (collapsed selection)
						editor.tf.select({
							anchor: startPoint,
							focus: startPoint,
						})
						editor.tf.focus()
					}
				}, 0)
				return
			}

			setOpen(false)
			// No next block exists, just focus the editor
			setTimeout(() => {
				editor.tf.focus()
			}, 0)
		}
	}

	return (
		<PopoverContent
			className={cn(
				"flex gap-2 p-1",
				!isInline && "w-[var(--radix-popover-trigger-width)]",
			)}
			contentEditable={false}
			align="start"
		>
			<EquationInput
				className={cn(
					"max-h-[50vh] grow resize-none p-2 text-sm outline-none",
					className,
				)}
				state={{ isInline, open, onClose }}
				autoFocus
				spellCheck={false}
				autoCapitalize="off"
				onKeyDown={(e) => {
					// Handle Shift+Enter to complete input
					if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
						e.preventDefault()
						e.stopPropagation()
						onClose()
						return
					}

					// Handle ArrowLeft at first position for inline equations
					if (e.key === "ArrowLeft" && isInline) {
						const textarea = e.currentTarget as HTMLTextAreaElement
						if (textarea.selectionStart === 0 && textarea.selectionEnd === 0) {
							e.preventDefault()
							e.stopPropagation()
							setOpen(false)
							const path = editor.api.findPath(element)
							if (path) {
								const beforePoint = editor.api.before(path)
								if (beforePoint) {
									setTimeout(() => {
										editor.tf.select({
											anchor: beforePoint,
											focus: beforePoint,
										})
										editor.tf.focus()
									}, 0)
								}
							}
							return
						}
					}

					// Handle ArrowRight at last position for inline equations
					if (e.key === "ArrowRight" && isInline) {
						const textarea = e.currentTarget as HTMLTextAreaElement
						if (textarea.selectionStart === textarea.value.length) {
							e.preventDefault()
							e.stopPropagation()
							setOpen(false)
							setTimeout(() => {
								editor.tf.select(element, { focus: true, next: true })
								editor.tf.focus()
							}, 0)
							return
						}
					}
				}}
				{...props}
			/>

			<Button variant="secondary" className="px-3" onClick={onClose}>
				Done <CornerDownLeftIcon className="size-3.5" />
			</Button>
		</PopoverContent>
	)
}

export const useEquationElement = ({
	element,
	katexRef,
	options,
}: {
	element: TEquationElement
	katexRef: React.MutableRefObject<HTMLDivElement | null>
	options?: KatexOptions
}) => {
	// biome-ignore lint/correctness/useExhaustiveDependencies: true
	useEffect(() => {
		if (!katexRef.current) return
		const equation =
			typeof element.environment === "string"
				? `\\begin{${element.environment}}\n${element.texExpression}\n\\end{${element.environment}}`
				: element.texExpression
		let isActive = true
		void loadKatex().then(({ default: katex }) => {
			if (!isActive || !katexRef.current) return
			katex.render(equation, katexRef.current, options)
		})
		return () => {
			isActive = false
		}
	}, [element.environment, element.texExpression])
}

const equationEnvironments: { label: string; value: string }[] =
	KATEX_ENVIRONMENTS.map((env) => ({
		value: env,
		label: env,
	}))

function EquationEnvironmentCombobox({
	onSelect,
}: {
	onSelect: (value: string) => void
}) {
	const [open, setOpen] = useState(false)
	const [searchValue, setSearchValue] = useState("")
	const readOnly = useReadOnly()
	const element = useElement<TEquationElement>()

	const value = element.environment || "equation"

	const currentLabel =
		equationEnvironments.find((env) => env.value === value)?.label ?? value

	const items = equationEnvironments.filter(
		(env) =>
			!searchValue ||
			env.label.toLowerCase().includes(searchValue.toLowerCase()),
	)

	if (readOnly) return null

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					size="sm"
					variant="ghost"
					className="h-6 justify-between gap-1 px-2 text-xs text-muted-foreground"
					aria-expanded={open}
					role="combobox"
				>
					{currentLabel as any}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-[200px] p-0"
				onCloseAutoFocus={() => setSearchValue("")}
				align="end"
			>
				<Command shouldFilter={false}>
					<CommandInput
						className="h-9"
						value={searchValue}
						onValueChange={(v) => setSearchValue(v)}
						placeholder="Search environment..."
					/>
					<CommandEmpty>No environment found.</CommandEmpty>
					<CommandList className="max-h-[300px] overflow-y-auto">
						<CommandGroup>
							{items.map((env) => (
								<CommandItem
									key={env.value}
									className="cursor-pointer"
									value={env.value}
									onSelect={(newValue) => {
										setSearchValue(newValue)
										setOpen(false)
										onSelect(newValue)
									}}
								>
									{env.label}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}
