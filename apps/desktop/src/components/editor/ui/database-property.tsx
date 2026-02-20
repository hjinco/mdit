import {
	datePattern,
	formatLocalDate,
	parseYMDToLocalDate,
	type ValueType,
} from "@mdit/editor/utils/frontmatter-value-utils"
import { Button } from "@mdit/ui/components/button"
import { Calendar } from "@mdit/ui/components/calendar"
import { Checkbox } from "@mdit/ui/components/checkbox"
import { Input } from "@mdit/ui/components/input"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@mdit/ui/components/popover"
import { cn } from "@mdit/ui/lib/utils"
import {
	CalendarIcon,
	CheckSquare2,
	HashIcon,
	ListIcon,
	TypeIcon,
} from "lucide-react"
import type {
	ComponentPropsWithoutRef,
	ComponentType,
	HTMLInputTypeAttribute,
} from "react"
import { useEffect, useRef, useState } from "react"

export const PROPERTY_ICONS: Record<
	ValueType,
	ComponentType<{ className?: string }>
> = {
	string: TypeIcon,
	number: HashIcon,
	boolean: CheckSquare2,
	date: CalendarIcon,
	array: ListIcon,
}

type InlineEditableFieldProps = {
	value: string
	placeholder: string
	onCommit: (nextValue: string) => void
	inputType?: HTMLInputTypeAttribute
	className?: string
	autoEdit?: boolean
	buttonProps?: Omit<
		ComponentPropsWithoutRef<typeof Button>,
		"onClick" | "variant"
	>
	inputProps?: Omit<
		ComponentPropsWithoutRef<typeof Input>,
		"value" | "onChange" | "onBlur" | "type" | "className"
	>
}

export function InlineEditableField({
	value,
	placeholder,
	onCommit,
	inputType = "text",
	className,
	autoEdit = false,
	buttonProps,
	inputProps,
}: InlineEditableFieldProps) {
	const [isEditing, setIsEditing] = useState(false)
	const inputRef = useRef<HTMLInputElement | null>(null)
	const hasAutoEdited = useRef(false)

	useEffect(() => {
		if (autoEdit && !isEditing && !hasAutoEdited.current) {
			hasAutoEdited.current = true
			// Add a small delay to ensure scrolling completes before focusing
			const timer = setTimeout(() => {
				setIsEditing(true)
			}, 100)
			return () => clearTimeout(timer)
		}
	}, [autoEdit, isEditing])

	useEffect(() => {
		if (!isEditing) return
		const timer = setTimeout(() => {
			inputRef.current?.focus()
			if (inputType !== "number") {
				inputRef.current?.select()
			}
		}, 0)
		return () => clearTimeout(timer)
	}, [isEditing, inputType])

	const commitAndClose = (nextValue?: string) => {
		const resolved = nextValue ?? inputRef.current?.value ?? ""
		onCommit(resolved)
		setIsEditing(false)
	}

	return (
		<div className="group/cell relative flex h-full min-h-[34px] w-full items-center">
			{isEditing ? (
				<div className="absolute inset-0 z-50 flex items-center bg-background ring-2 ring-inset ring-brand/80">
					<Input
						ref={(node) => {
							inputRef.current = node
						}}
						type={inputType}
						defaultValue={value}
						onBlur={() => commitAndClose()}
						onKeyDown={(event) => {
							event.stopPropagation()
							inputProps?.onKeyDown?.(event)
							if (event.key === "Enter") {
								commitAndClose()
							} else if (event.key === "Escape") {
								setIsEditing(false)
							}
						}}
						className={cn(
							"h-full w-full rounded-none border-0 bg-transparent px-3 text-sm text-foreground focus-visible:ring-0 focus-visible:ring-offset-0",
							className,
						)}
						autoFocus
						{...inputProps}
					/>
				</div>
			) : (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					{...buttonProps}
					className={cn(
						"h-full w-full justify-start rounded-none px-3 text-left text-sm text-foreground/90 hover:bg-muted/50 hover:text-foreground/90 transition-none",
						!value && "text-muted-foreground/40 hover:text-muted-foreground/40",
						className,
						buttonProps?.className,
					)}
					onClick={() => {
						setIsEditing(true)
					}}
				>
					<span className="truncate">{value || placeholder}</span>
				</Button>
			)}
		</div>
	)
}

type ArrayEditorProps = {
	value: unknown
	onChange: (nextValue: string[]) => void
	placeholder?: string
}

function parseArrayItems(raw: string) {
	return raw
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean)
}

const TAG_COLORS = [
	"bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
	"bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
	"bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
	"bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
	"bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
	"bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
	"bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
	"bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
	"bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
]

function getTagColorClass(tag: string) {
	let hash = 0
	for (let i = 0; i < tag.length; i++) {
		hash = Math.imul(hash, 31) + tag.charCodeAt(i)
	}
	const index = Math.abs(hash) % TAG_COLORS.length
	return TAG_COLORS[index]
}

function DatabaseArrayEditor({
	value,
	onChange,
	placeholder = "Empty",
}: ArrayEditorProps) {
	const [isEditing, setIsEditing] = useState(false)
	const [draft, setDraft] = useState("")
	const inputRef = useRef<HTMLInputElement | null>(null)
	const containerRef = useRef<HTMLDivElement>(null)

	// Use refs to access latest values in effect without re-binding
	const draftRef = useRef(draft)
	const onChangeRef = useRef(onChange)

	useEffect(() => {
		draftRef.current = draft
	}, [draft])

	useEffect(() => {
		onChangeRef.current = onChange
	}, [onChange])

	const items = Array.isArray(value)
		? value.map((item) => String(item ?? "").trim()).filter(Boolean)
		: typeof value === "string"
			? parseArrayItems(value)
			: []

	const itemsRef = useRef(items)
	useEffect(() => {
		itemsRef.current = items
	}, [items])

	useEffect(() => {
		if (!isEditing) return

		function handleClickOutside(event: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target as Node)
			) {
				const currentDraft = draftRef.current
				if (currentDraft.trim()) {
					const nextItems = parseArrayItems(currentDraft)
					if (nextItems.length) {
						const merged = [...itemsRef.current]
						for (const item of nextItems) {
							if (!merged.includes(item)) {
								merged.push(item)
							}
						}
						onChangeRef.current(merged)
					}
				}
				setIsEditing(false)
				setDraft("")
			}
		}
		document.addEventListener("mousedown", handleClickOutside)
		return () => document.removeEventListener("mousedown", handleClickOutside)
	}, [isEditing])

	useEffect(() => {
		if (isEditing) {
			inputRef.current?.focus()
		}
	}, [isEditing])

	const addItems = (raw: string) => {
		const nextItems = parseArrayItems(raw)
		if (!nextItems.length) return
		const merged = [...items]
		for (const item of nextItems) {
			if (!merged.includes(item)) {
				merged.push(item)
			}
		}
		onChange(merged)
		setDraft("")
	}

	const removeItem = (index: number) => {
		const next = items.filter((_, i) => i !== index)
		onChange(next)
	}

	if (!isEditing) {
		if (items.length === 0) {
			return (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-full w-full justify-start rounded-none px-3 text-left text-sm text-muted-foreground/40 hover:bg-muted/50 hover:text-muted-foreground/40 transition-none"
					onClick={() => setIsEditing(true)}
				>
					<span className="truncate">{placeholder}</span>
				</Button>
			)
		}
		return (
			<div
				className="flex h-full w-full cursor-pointer items-center gap-1.5 overflow-hidden px-3 hover:bg-muted/50"
				onClick={() => setIsEditing(true)}
			>
				{items.map((item) => (
					<span
						key={item}
						className={cn(
							"inline-flex shrink-0 items-center rounded-[3px] px-1.5 py-0.5 text-[12px] leading-none",
							getTagColorClass(item),
						)}
					>
						{item}
					</span>
				))}
			</div>
		)
	}

	return (
		<div
			ref={containerRef}
			className="absolute inset-0 z-50 flex h-full w-full items-center gap-1.5 overflow-x-auto bg-background px-3 text-sm ring-2 ring-inset ring-brand/80"
			onClick={() => inputRef.current?.focus()}
		>
			{items.map((item, index) => (
				<span
					key={`${item}-${index}`}
					className={cn(
						"inline-flex shrink-0 items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-[12px] leading-none",
						getTagColorClass(item),
					)}
				>
					<span className="max-w-[8rem] truncate" title={item}>
						{item}
					</span>
					<button
						type="button"
						className="cursor-pointer opacity-50 hover:opacity-100"
						onClick={(event) => {
							event.stopPropagation()
							removeItem(index)
						}}
						aria-label={`Remove ${item}`}
						tabIndex={-1}
					>
						×
					</button>
				</span>
			))}
			<input
				ref={inputRef}
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === ",") {
						event.preventDefault()
						addItems(draft)
					} else if (event.key === "Backspace" && !draft && items.length) {
						event.preventDefault()
						removeItem(items.length - 1)
					} else if (event.key === "Escape") {
						setIsEditing(false)
						setDraft("")
					}
				}}
				className="h-full min-w-[60px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
			/>
		</div>
	)
}

export function ValueEditor({
	type,
	value,
	onValueChange,
	className,
}: {
	type: ValueType
	value: unknown
	onValueChange: (value: unknown) => void
	className?: string
}) {
	const [isCalendarOpen, setIsCalendarOpen] = useState(false)
	const stringValue = String(value ?? "")

	switch (type) {
		case "boolean":
			return (
				<div
					className={cn(
						"flex h-full min-h-[34px] items-center px-3",
						className,
					)}
				>
					<Checkbox
						checked={Boolean(value)}
						onCheckedChange={(checked) => onValueChange(checked === true)}
						className="h-4 w-4 rounded-[3px]"
					/>
				</div>
			)
		case "date": {
			const normalized =
				value instanceof Date
					? formatLocalDate(value)
					: datePattern.test(stringValue)
						? stringValue.slice(0, 10)
						: ""

			const dateValue = normalized ? parseYMDToLocalDate(normalized) : undefined

			return (
				<Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className={cn(
								"h-full min-h-[34px] w-full justify-start rounded-none px-3 text-left text-sm text-foreground/90 hover:bg-muted/50 hover:text-foreground/90 transition-none",
								!dateValue &&
									"text-muted-foreground/40 hover:text-muted-foreground/40",
								className,
							)}
						>
							<CalendarIcon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground/70" />
							<span className="truncate">
								{dateValue ? dateValue.toLocaleDateString() : "No date"}
							</span>
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-auto p-0" align="start">
						<Calendar
							mode="single"
							selected={dateValue}
							onSelect={(date) => {
								if (date) {
									onValueChange(formatLocalDate(date))
								}
								setIsCalendarOpen(false)
							}}
						/>
					</PopoverContent>
				</Popover>
			)
		}
		case "array":
			return (
				<div className={cn("h-full w-full", className)}>
					<DatabaseArrayEditor value={value} onChange={onValueChange} />
				</div>
			)
		case "number":
			return (
				<InlineEditableField
					value={stringValue}
					placeholder="Empty"
					inputType="number"
					onCommit={(newValue) =>
						onValueChange(newValue ? Number(newValue) : null)
					}
					className={className}
				/>
			)
		case "string":
			return (
				<InlineEditableField
					value={stringValue}
					placeholder="Empty"
					onCommit={(newValue) => onValueChange(newValue)}
					className={className}
				/>
			)
		default:
			return null
	}
}
