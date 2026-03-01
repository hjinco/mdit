import { Button } from "@mdit/ui/components/button"
import { Calendar } from "@mdit/ui/components/calendar"
import { Command } from "@mdit/ui/components/command"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@mdit/ui/components/dropdown-menu"
import { Input } from "@mdit/ui/components/input"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@mdit/ui/components/popover"
import { Switch } from "@mdit/ui/components/switch"
import { cn } from "@mdit/ui/lib/utils"
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table"
import {
	CalendarIcon,
	HashIcon,
	ListIcon,
	PlusIcon,
	ToggleLeftIcon,
	TypeIcon,
	XIcon,
} from "lucide-react"
import { useEditorRef } from "platejs/react"
import {
	type ComponentPropsWithoutRef,
	type ComponentType,
	type HTMLInputTypeAttribute,
	type ReactNode,
	useCallback,
	useEffect,
	useEffectEvent,
	useMemo,
	useRef,
	useState,
} from "react"
import type { LinkWorkspaceState } from "../link/link-kit-types"
import { flattenWorkspaceFiles } from "../link/link-toolbar-utils"
import {
	FRONTMATTER_FOCUS_EVENT,
	type FrontmatterFocusTarget,
	takePendingFrontmatterFocusTarget,
} from "./frontmatter-focus"
import {
	convertValueToType,
	datePattern,
	formatLocalDate,
	parseYMDToLocalDate,
	type ValueType,
} from "./frontmatter-value-utils"
import { FrontmatterWikiInlinePreview } from "./frontmatter-wiki-inline-preview"
import {
	getActiveFrontmatterWikiQuery,
	isSingleFrontmatterWikiLinkValue,
	replaceFrontmatterWikiQuery,
} from "./frontmatter-wiki-link-utils"
import {
	type ResolveFrontmatterWikiLinkTarget,
	resolveFrontmatterWikiLinks,
} from "./frontmatter-wiki-resolve-utils"
import { FrontmatterWikiSuggestionPopover } from "./frontmatter-wiki-suggestion-popover"
import {
	buildFrontmatterWikiSuggestions,
	type FrontmatterWikiSuggestionEntry,
} from "./frontmatter-wiki-suggestion-utils"
import { FrontmatterArray } from "./node-frontmatter-array"

export const KB_NAV_ATTR = "data-kb-nav"

export type KVRow = {
	id: string
	key: string
	value: unknown
	type: ValueType
}

const columnsOrder = ["type", "key", "value", "actions"] as const
type ColumnId = (typeof columnsOrder)[number]
type CellPosition = { rowIndex: number; colIndex: number }

export type FocusRegistration = {
	rowId: string
	columnId: string
	register: (node: HTMLElement | null) => void
}

export type FrontmatterWikiLinkHandler = (
	target: string,
) => void | Promise<void>

export type FrontmatterResolveWikiLinkTargetHandler =
	ResolveFrontmatterWikiLinkTarget

type FrontmatterTableProps = {
	data: KVRow[]
	onChange: (data: KVRow[]) => void
	onOpenWikiLink?: FrontmatterWikiLinkHandler
	getLinkWorkspaceState?: () => LinkWorkspaceState
	resolveWikiLinkTarget?: FrontmatterResolveWikiLinkTargetHandler
}

const PROPERTY_ICONS: Record<
	ValueType,
	ComponentType<{ className?: string }>
> = {
	string: TypeIcon,
	number: HashIcon,
	boolean: ToggleLeftIcon,
	date: CalendarIcon,
	array: ListIcon,
}

function TypeSelect({
	value,
	onValueChange,
	focusRegistration,
}: {
	value: ValueType
	onValueChange: (newType: ValueType) => void
	focusRegistration?: FocusRegistration
}) {
	const Icon = PROPERTY_ICONS[value]
	const focusAttrs = focusRegistration
		? {
				ref: focusRegistration.register,
				"data-row-id": focusRegistration.rowId,
				"data-col-id": focusRegistration.columnId,
			}
		: {}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild {...focusAttrs}>
				<Button
					variant="ghost"
					size="icon"
					className="rounded-sm data-[kb-nav=true]:border-ring data-[kb-nav=true]:ring-ring/50 data-[kb-nav=true]:ring-[1px]"
				>
					<Icon className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				<DropdownMenuItem onSelect={() => onValueChange("string")}>
					<TypeIcon className="mr-2 h-4 w-4" />
					<span>Text</span>
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => onValueChange("number")}>
					<HashIcon className="mr-2 h-4 w-4" />
					<span>Number</span>
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => onValueChange("boolean")}>
					<ToggleLeftIcon className="mr-2 h-4 w-4" />
					<span>Boolean</span>
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => onValueChange("date")}>
					<CalendarIcon className="mr-2 h-4 w-4" />
					<span>Date</span>
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => onValueChange("array")}>
					<ListIcon className="mr-2 h-4 w-4" />
					<span>Array</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

type InlineEditableFieldProps = {
	value: string
	placeholder: string
	onCommit: (nextValue: string) => void
	inputType?: HTMLInputTypeAttribute
	focusRegistration?: FocusRegistration
	buttonProps?: Omit<
		ComponentPropsWithoutRef<typeof Button>,
		"onClick" | "className" | "variant"
	>
	inputProps?: Omit<
		ComponentPropsWithoutRef<typeof Input>,
		"value" | "onChange" | "onBlur" | "type" | "className"
	>
	displayContent?: ReactNode
	getLinkWorkspaceState?: () => LinkWorkspaceState
	resolveWikiLinkTarget?: FrontmatterResolveWikiLinkTargetHandler
	enableWikiSuggestions?: boolean
	wikiLinkMode?: "any" | "single"
}

const shouldIgnoreArrowNavigation = (element: HTMLElement) => {
	if (element.isContentEditable) return true
	const tag = element.tagName.toLowerCase()
	if (tag === "input" || tag === "textarea" || tag === "select") return true
	if (element.getAttribute("role") === "textbox") return true
	return false
}

function InlineEditableField({
	value,
	placeholder,
	onCommit,
	inputType = "text",
	focusRegistration,
	buttonProps,
	inputProps,
	displayContent,
	getLinkWorkspaceState,
	resolveWikiLinkTarget,
	enableWikiSuggestions = false,
	wikiLinkMode = "any",
}: InlineEditableFieldProps) {
	const [isEditing, setIsEditing] = useState(false)
	const [draftValue, setDraftValue] = useState(value)
	const [cursorPosition, setCursorPosition] = useState(0)
	const inputRef = useRef<HTMLInputElement | null>(null)
	const wikiPopoverAnchorRef = useRef<HTMLDivElement | null>(null)
	const registeredNodeRef = useRef<HTMLElement | null>(null)
	const linkWorkspaceState = getLinkWorkspaceState?.()
	const workspaceFiles = useMemo(
		() =>
			flattenWorkspaceFiles(
				linkWorkspaceState?.entries ?? [],
				linkWorkspaceState?.workspacePath ?? null,
			),
		[linkWorkspaceState?.entries, linkWorkspaceState?.workspacePath],
	)
	const activeWikiQuery = useMemo(() => {
		if (!enableWikiSuggestions) return null
		if (!isEditing) return null
		return getActiveFrontmatterWikiQuery(draftValue, cursorPosition)
	}, [cursorPosition, draftValue, enableWikiSuggestions, isEditing])
	const wikiSuggestions = useMemo(() => {
		if (!activeWikiQuery) return []
		return buildFrontmatterWikiSuggestions(
			workspaceFiles,
			activeWikiQuery.query,
		)
	}, [activeWikiQuery, workspaceFiles])
	const showWikiSuggestionPopover =
		isEditing &&
		enableWikiSuggestions &&
		!!activeWikiQuery &&
		wikiSuggestions.length > 0

	useEffect(() => {
		if (isEditing) {
			setDraftValue(value)
		} else {
			setDraftValue(value)
			setCursorPosition(value.length)
		}
	}, [isEditing, value])

	useEffect(() => {
		if (!isEditing) return
		setTimeout(() => {
			const input = inputRef.current
			if (!input) return
			input.select()
			const selectionStart = input.selectionStart ?? input.value.length
			setCursorPosition(selectionStart)
		}, 0)
	}, [isEditing])

	const restoreRegisteredFocus = () => {
		setTimeout(() => {
			if (registeredNodeRef.current) {
				registeredNodeRef.current.setAttribute(KB_NAV_ATTR, "true")
				registeredNodeRef.current.focus({ preventScroll: true })
			}
		}, 0)
	}

	const commitAndClose = useEffectEvent(
		(nextValue?: string, preserveFocus?: boolean) => {
			const rawValue = nextValue ?? draftValue ?? inputRef.current?.value ?? ""
			const shouldResolveWikiLinks =
				enableWikiSuggestions &&
				(wikiLinkMode === "any" || isSingleFrontmatterWikiLinkValue(rawValue))
			void resolveFrontmatterWikiLinks(
				rawValue,
				shouldResolveWikiLinks ? resolveWikiLinkTarget : undefined,
			).then((resolvedValue) => {
				onCommit(resolvedValue)
			})
			setIsEditing(false)
			if (preserveFocus) restoreRegisteredFocus()
		},
	)

	const cancelEditing = (preserveFocus?: boolean) => {
		setIsEditing(false)
		if (preserveFocus) restoreRegisteredFocus()
	}

	const applyWikiSuggestion = useCallback(
		(suggestion: FrontmatterWikiSuggestionEntry) => {
			if (!activeWikiQuery) return
			const nextValue = replaceFrontmatterWikiQuery(
				draftValue,
				activeWikiQuery,
				suggestion.target,
			)
			commitAndClose(nextValue, true)
		},
		[activeWikiQuery, draftValue],
	)

	const focusAttrs = focusRegistration
		? {
				ref: (node: HTMLElement | null) => {
					registeredNodeRef.current = node
					focusRegistration.register(node)
				},
				"data-row-id": focusRegistration.rowId,
				"data-col-id": focusRegistration.columnId,
			}
		: {}

	return (
		<div ref={wikiPopoverAnchorRef} className="relative w-full h-8">
			{isEditing ? (
				<Command
					loop
					shouldFilter={false}
					className="h-auto w-full overflow-visible rounded-none bg-transparent text-inherit"
				>
					<Input
						ref={(node) => {
							inputRef.current = node
							focusAttrs?.ref?.(node)
						}}
						type={inputType}
						value={draftValue}
						onChange={(event) => {
							setDraftValue(event.target.value)
							setCursorPosition(
								event.target.selectionStart ?? event.target.value.length,
							)
						}}
						onBlur={() => {
							commitAndClose()
						}}
						onClick={(event) => {
							setCursorPosition(
								event.currentTarget.selectionStart ??
									event.currentTarget.value.length,
							)
						}}
						onSelect={(event) => {
							setCursorPosition(
								event.currentTarget.selectionStart ??
									event.currentTarget.value.length,
							)
						}}
						onKeyDown={(event) => {
							const isCommandNavigationKey =
								showWikiSuggestionPopover &&
								(event.key === "ArrowDown" ||
									event.key === "ArrowUp" ||
									event.key === "Enter")
							if (!isCommandNavigationKey) {
								event.stopPropagation()
							}
							inputProps?.onKeyDown?.(event)

							if (isCommandNavigationKey) {
								return
							}

							if (event.key === "Enter") {
								commitAndClose(undefined, true)
							} else if (event.key === "Escape") {
								cancelEditing(true)
							}
						}}
						className="rounded-sm bg-background dark:bg-background text-foreground absolute left-0 w-full h-8 -top-[0.5px] border-0"
						autoFocus
						data-row-id={focusAttrs?.["data-row-id"]}
						data-col-id={focusAttrs?.["data-col-id"]}
						{...inputProps}
					/>
					{showWikiSuggestionPopover && (
						<FrontmatterWikiSuggestionPopover
							anchor={wikiPopoverAnchorRef.current}
							suggestions={wikiSuggestions}
							onSelect={applyWikiSuggestion}
						/>
					)}
				</Command>
			) : (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className={cn(
						"rounded-sm w-full justify-start px-3 text-left truncate data-[kb-nav=true]:border-ring data-[kb-nav=true]:ring-ring/50 data-[kb-nav=true]:ring-[1px] border-none",
						!value && "text-muted-foreground italic",
					)}
					onClick={(event) => {
						if (event.metaKey || event.ctrlKey) return
						setIsEditing(true)
					}}
					{...focusAttrs}
					{...buttonProps}
				>
					{value ? (displayContent ?? value) : placeholder}
				</Button>
			)}
		</div>
	)
}

function ValueEditor({
	type,
	value,
	onValueChange,
	focusRegistration,
	onOpenWikiLink,
	getLinkWorkspaceState,
	resolveWikiLinkTarget,
}: {
	type: ValueType
	value: unknown
	onValueChange: (value: unknown) => void
	focusRegistration?: FocusRegistration
	onOpenWikiLink?: FrontmatterWikiLinkHandler
	getLinkWorkspaceState?: () => LinkWorkspaceState
	resolveWikiLinkTarget?: FrontmatterResolveWikiLinkTargetHandler
}) {
	const [isCalendarOpen, setIsCalendarOpen] = useState(false)
	const stringValue = String(value ?? "")

	switch (type) {
		case "boolean":
			return (
				<div className="h-8 flex items-center justify-start ml-2">
					<Switch
						checked={Boolean(value)}
						onCheckedChange={onValueChange}
						ref={focusRegistration?.register}
						data-row-id={focusRegistration?.rowId}
						data-col-id={focusRegistration?.columnId}
						className="data-[kb-nav=true]:border-ring data-[kb-nav=true]:ring-ring/50 data-[kb-nav=true]:ring-[1px]"
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
								"rounded-sm data-[kb-nav=true]:border-ring data-[kb-nav=true]:ring-ring/50 data-[kb-nav=true]:ring-[1px]",
								!dateValue && "text-muted-foreground",
							)}
							ref={focusRegistration?.register}
							data-row-id={focusRegistration?.rowId}
							data-col-id={focusRegistration?.columnId}
						>
							<CalendarIcon className="mr-2 h-4 w-4" />
							{dateValue ? (
								dateValue.toLocaleDateString()
							) : (
								<span>Pick a date</span>
							)}
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
				<FrontmatterArray
					value={value}
					onChange={onValueChange}
					focusRegistration={focusRegistration}
					onOpenWikiLink={onOpenWikiLink}
					getLinkWorkspaceState={getLinkWorkspaceState}
					resolveWikiLinkTarget={resolveWikiLinkTarget}
				/>
			)
		case "number":
			return (
				<InlineEditableField
					value={stringValue}
					placeholder="Enter a number"
					inputType="number"
					onCommit={(newValue) => onValueChange(Number(newValue))}
					focusRegistration={focusRegistration}
				/>
			)
		case "string": {
			const shouldRenderWikiInlinePreview =
				isSingleFrontmatterWikiLinkValue(stringValue)
			return (
				<InlineEditableField
					value={stringValue}
					placeholder="Enter text"
					onCommit={(newValue) => onValueChange(newValue)}
					focusRegistration={focusRegistration}
					displayContent={
						shouldRenderWikiInlinePreview ? (
							<FrontmatterWikiInlinePreview
								value={stringValue}
								onOpenWikiLink={onOpenWikiLink}
							/>
						) : undefined
					}
					enableWikiSuggestions
					wikiLinkMode="single"
					getLinkWorkspaceState={getLinkWorkspaceState}
					resolveWikiLinkTarget={resolveWikiLinkTarget}
				/>
			)
		}
		default:
			return null
	}
}

export function FrontmatterTable({
	data,
	onChange,
	onOpenWikiLink,
	getLinkWorkspaceState,
	resolveWikiLinkTarget,
}: FrontmatterTableProps) {
	const cellRefs = useRef<
		Record<string, Partial<Record<ColumnId, HTMLElement | null>>>
	>({})
	const rowOrderRef = useRef<string[]>([])
	const pendingDeleteFocusRef = useRef<{ targetRowId: string | null } | null>(
		null,
	)
	const lastKeyboardFocusedRef = useRef<HTMLElement | null>(null)
	const keyboardNavFlagRef = useRef(false)
	const addButtonRef = useRef<HTMLButtonElement | null>(null)
	const editor = useEditorRef()

	const [tableData, setTableData] = useState(data)

	useEffect(() => {
		setTableData(data)
	}, [data])

	const updateTableData = useCallback(
		(updater: (rows: KVRow[]) => KVRow[]) => {
			setTableData((prev) => {
				const next = updater(prev)
				onChange(next)
				return next
			})
		},
		[onChange],
	)

	const registerCellRef = useCallback(
		(rowId: string, columnId: ColumnId, node: HTMLElement | null) => {
			if (!cellRefs.current[rowId]) {
				cellRefs.current[rowId] = {}
			}
			cellRefs.current[rowId][columnId] = node
		},
		[],
	)

	const createFocusRegistration = useCallback(
		(rowId: string, columnId: ColumnId): FocusRegistration => ({
			rowId,
			columnId,
			register: (node) => {
				registerCellRef(rowId, columnId, node)
			},
		}),
		[registerCellRef],
	)

	const getDeleteFocusTargetRowId = useCallback((deletedRowId: string) => {
		const rowIndex = rowOrderRef.current.indexOf(deletedRowId)
		if (rowIndex === -1) return null
		return (
			rowOrderRef.current[rowIndex - 1] ??
			rowOrderRef.current[rowIndex + 1] ??
			null
		)
	}, [])

	const columns = useMemo<ColumnDef<KVRow>[]>(
		() => [
			{
				accessorKey: "type",
				cell: ({ row }) => {
					const updateType = (newType: ValueType) => {
						updateTableData((items) =>
							items.map((item) =>
								item.id === row.original.id
									? {
											...item,
											type: newType,
											value: convertValueToType(item.value, newType),
										}
									: item,
							),
						)
					}

					return (
						<TypeSelect
							value={row.original.type}
							onValueChange={updateType}
							focusRegistration={createFocusRegistration(
								row.original.id,
								"type",
							)}
						/>
					)
				},
			},
			{
				accessorKey: "key",
				cell: ({ row }) => {
					const updateKey = (newKey: string) => {
						updateTableData((items) =>
							items.map((item) =>
								item.id === row.original.id ? { ...item, key: newKey } : item,
							),
						)
					}

					return (
						<InlineEditableField
							value={row.original.key ?? ""}
							placeholder="Property name"
							onCommit={updateKey}
							focusRegistration={createFocusRegistration(
								row.original.id,
								"key",
							)}
						/>
					)
				},
			},
			{
				accessorKey: "value",
				cell: ({ row }) => {
					const updateValue = (newValue: unknown) => {
						updateTableData((items) =>
							items.map((item) =>
								item.id === row.original.id
									? {
											...item,
											value: convertValueToType(newValue, row.original.type),
										}
									: item,
							),
						)
					}

					return (
						<ValueEditor
							type={row.original.type}
							value={row.original.value}
							onValueChange={updateValue}
							onOpenWikiLink={onOpenWikiLink}
							getLinkWorkspaceState={getLinkWorkspaceState}
							resolveWikiLinkTarget={resolveWikiLinkTarget}
							focusRegistration={createFocusRegistration(
								row.original.id,
								"value",
							)}
						/>
					)
				},
			},
			{
				id: "actions",
				cell: ({ row }) => {
					const removeRow = () => {
						updateTableData((items) =>
							items.filter((item) => item.id !== row.original.id),
						)
					}

					return (
						<Button
							variant="ghost"
							size="icon"
							onClick={removeRow}
							onKeyDown={(event) => {
								if (
									event.key !== "Enter" &&
									event.key !== " " &&
									event.key !== "Spacebar"
								)
									return
								pendingDeleteFocusRef.current = {
									targetRowId: getDeleteFocusTargetRowId(row.original.id),
								}
							}}
							className="rounded-sm text-muted-foreground hover:text-destructive hover:bg-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 focus-visible:opacity-100 data-[kb-nav=true]:border-ring data-[kb-nav=true]:ring-ring/50 data-[kb-nav=true]:ring-[1px] transition-opacity"
							ref={(node) => {
								registerCellRef(row.original.id, "actions", node)
							}}
							data-row-id={row.original.id}
							data-col-id="actions"
						>
							<XIcon />
						</Button>
					)
				},
			},
		],
		[
			createFocusRegistration,
			getDeleteFocusTargetRowId,
			getLinkWorkspaceState,
			onOpenWikiLink,
			resolveWikiLinkTarget,
			registerCellRef,
			updateTableData,
		],
	)

	const table = useReactTable({
		data: tableData,
		columns,
		getCoreRowModel: getCoreRowModel(),
	})

	rowOrderRef.current = table.getRowModel().rows.map((row) => row.original.id)

	const getCellPosition = useCallback(
		(target: HTMLElement | null): CellPosition | null => {
			if (!target) return null

			const rowId = target.dataset.rowId
			const columnId = target.dataset.colId as ColumnId | undefined
			if (!rowId || !columnId) return null

			const rowIndex = rowOrderRef.current.indexOf(rowId)
			const colIndex = columnsOrder.indexOf(columnId)
			if (rowIndex === -1 || colIndex === -1) return null

			return { rowIndex, colIndex }
		},
		[],
	)

	const focusCell = useCallback((rowId: string, columnId: ColumnId) => {
		const target = cellRefs.current[rowId]?.[columnId]
		if (target) {
			if (
				lastKeyboardFocusedRef.current &&
				lastKeyboardFocusedRef.current !== target
			) {
				lastKeyboardFocusedRef.current.removeAttribute(KB_NAV_ATTR)
			}
			target.setAttribute(KB_NAV_ATTR, "true")
			lastKeyboardFocusedRef.current = target
			requestAnimationFrame(() => {
				target.focus({ preventScroll: true })
			})
		}
	}, [])

	const focusCellByIndex = useCallback(
		(rowIndex: number, colIndex: number) => {
			if (
				rowIndex < 0 ||
				rowIndex >= rowOrderRef.current.length ||
				colIndex < 0 ||
				colIndex >= columnsOrder.length
			) {
				return false
			}

			focusCell(rowOrderRef.current[rowIndex], columnsOrder[colIndex])
			return true
		},
		[focusCell],
	)

	const focusAddButton = useCallback(() => {
		const target = addButtonRef.current
		if (!target) return false

		if (
			lastKeyboardFocusedRef.current &&
			lastKeyboardFocusedRef.current !== target
		) {
			lastKeyboardFocusedRef.current.removeAttribute(KB_NAV_ATTR)
		}
		target.setAttribute(KB_NAV_ATTR, "true")
		lastKeyboardFocusedRef.current = target
		requestAnimationFrame(() => {
			target.focus({ preventScroll: true })
		})
		return true
	}, [])

	const focusEditorSecondElement = useCallback(() => {
		if (!editor || editor.children.length < 2) return false
		keyboardNavFlagRef.current = true
		editor.tf.select([1], { edge: "start" })
		editor.tf.focus()
		return true
	}, [editor])

	const focusLastRowStart = useCallback(() => {
		const lastRowId = rowOrderRef.current.at(-1)
		if (!lastRowId) return false
		keyboardNavFlagRef.current = true
		const preferred: ColumnId[] = ["type", "key", "value", "actions"]
		for (const col of preferred) {
			if (cellRefs.current[lastRowId]?.[col]) {
				focusCell(lastRowId, col)
				return true
			}
		}
		return false
	}, [focusCell])

	const focusLastRowEnd = useCallback(() => {
		const lastRowId = rowOrderRef.current.at(-1)
		if (!lastRowId) return false
		keyboardNavFlagRef.current = true
		const preferred: ColumnId[] = ["actions", "value", "key", "type"]
		for (const col of preferred) {
			if (cellRefs.current[lastRowId]?.[col]) {
				focusCell(lastRowId, col)
				return true
			}
		}
		return false
	}, [focusCell])

	const handleTabNavigation = useCallback(
		(event: React.KeyboardEvent) => {
			if (event.key !== "Tab") return
			const target = event.target as HTMLElement | null
			const current = getCellPosition(target)
			if (!current) return

			let nextRowIndex = current.rowIndex
			let nextColIndex = current.colIndex + (event.shiftKey ? -1 : 1)

			if (nextColIndex >= columnsOrder.length) {
				nextColIndex = 0
				nextRowIndex += 1
			} else if (nextColIndex < 0) {
				nextColIndex = columnsOrder.length - 1
				nextRowIndex -= 1
			}

			if (
				nextRowIndex < 0 ||
				nextRowIndex >= rowOrderRef.current.length ||
				nextColIndex < 0 ||
				nextColIndex >= columnsOrder.length
			) {
				if (
					!event.shiftKey &&
					current.rowIndex === rowOrderRef.current.length - 1 &&
					nextRowIndex >= rowOrderRef.current.length
				) {
					event.preventDefault()
					keyboardNavFlagRef.current = true
					focusAddButton()
				}
				return
			}

			event.preventDefault()
			keyboardNavFlagRef.current = true
			focusCellByIndex(nextRowIndex, nextColIndex)
		},
		[focusAddButton, focusCellByIndex, getCellPosition],
	)

	const handleArrowNavigation = useCallback(
		(event: React.KeyboardEvent) => {
			const key = event.key
			if (
				key !== "ArrowUp" &&
				key !== "ArrowDown" &&
				key !== "ArrowLeft" &&
				key !== "ArrowRight"
			) {
				return
			}

			const target = event.target as HTMLElement | null
			if (!target || shouldIgnoreArrowNavigation(target)) return

			const navigationTarget =
				target.closest<HTMLElement>("[data-row-id][data-col-id]") ?? target
			const current = getCellPosition(navigationTarget)
			if (!current) return

			if (
				key === "ArrowDown" &&
				current.rowIndex === rowOrderRef.current.length - 1
			) {
				event.preventDefault()
				event.stopPropagation()
				keyboardNavFlagRef.current = true
				focusAddButton()
				return
			}

			let nextRowIndex = current.rowIndex
			let nextColIndex = current.colIndex

			if (key === "ArrowUp") nextRowIndex -= 1
			if (key === "ArrowDown") nextRowIndex += 1
			if (key === "ArrowLeft") nextColIndex -= 1
			if (key === "ArrowRight") nextColIndex += 1

			if (
				nextRowIndex < 0 ||
				nextRowIndex >= rowOrderRef.current.length ||
				nextColIndex < 0 ||
				nextColIndex >= columnsOrder.length
			) {
				event.preventDefault()
				event.stopPropagation()
				return
			}

			event.preventDefault()
			event.stopPropagation()
			keyboardNavFlagRef.current = true
			focusCellByIndex(nextRowIndex, nextColIndex)
		},
		[focusAddButton, focusCellByIndex, getCellPosition],
	)

	const handleKeyDownCapture = useCallback((event: React.KeyboardEvent) => {
		if (
			event.key === "Tab" ||
			event.key === "ArrowUp" ||
			event.key === "ArrowDown" ||
			event.key === "ArrowLeft" ||
			event.key === "ArrowRight"
		) {
			keyboardNavFlagRef.current = true
		}
	}, [])

	const handlePointerDownCapture = useCallback(() => {
		keyboardNavFlagRef.current = false
	}, [])

	const handleFocusCapture = useCallback((event: React.FocusEvent) => {
		const target = event.target as HTMLElement | null
		if (!target) return
		if (keyboardNavFlagRef.current) {
			if (
				lastKeyboardFocusedRef.current &&
				lastKeyboardFocusedRef.current !== target
			) {
				lastKeyboardFocusedRef.current.removeAttribute(KB_NAV_ATTR)
			}
			target.setAttribute(KB_NAV_ATTR, "true")
			lastKeyboardFocusedRef.current = target
		} else if (
			lastKeyboardFocusedRef.current &&
			lastKeyboardFocusedRef.current !== target &&
			lastKeyboardFocusedRef.current.getAttribute(KB_NAV_ATTR)
		) {
			lastKeyboardFocusedRef.current.removeAttribute(KB_NAV_ATTR)
			lastKeyboardFocusedRef.current = null
		}
	}, [])

	const handleBlurCapture = useCallback((event: React.FocusEvent) => {
		const target = event.target as HTMLElement | null
		if (!target) return
		if (target.getAttribute(KB_NAV_ATTR)) {
			target.removeAttribute(KB_NAV_ATTR)
			if (lastKeyboardFocusedRef.current === target) {
				lastKeyboardFocusedRef.current = null
			}
		}
	}, [])

	const handleAddButtonKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLButtonElement>) => {
			if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
				const moved =
					event.key === "ArrowUp" ? focusLastRowStart() : focusLastRowEnd()
				if (moved) {
					event.preventDefault()
					event.stopPropagation()
				}
				return
			}
			if (event.key === "Tab" && !event.shiftKey) {
				const moved = focusEditorSecondElement()
				if (moved) {
					event.preventDefault()
					event.stopPropagation()
				}
				return
			}
			if (event.key === "ArrowDown" || event.key === "ArrowRight") {
				const moved = focusEditorSecondElement()
				if (moved) {
					event.preventDefault()
					event.stopPropagation()
				}
			}
		},
		[focusEditorSecondElement, focusLastRowEnd, focusLastRowStart],
	)

	const addRow = () => {
		const existing = new Set(tableData.map((d) => d.key).filter(Boolean))
		const base = "property"
		let candidate = base
		let i = 1
		while (existing.has(candidate)) {
			candidate = `${base}_${i++}`
		}

		const newRow: KVRow = {
			id: crypto.randomUUID(),
			key: candidate,
			value: "",
			type: "string",
		}
		updateTableData((items) => [...items, newRow])
	}

	const applyFocusTarget = useCallback(
		(target: FrontmatterFocusTarget) => {
			if (target === "addButton") {
				keyboardNavFlagRef.current = true
				focusAddButton()
				return
			}

			const firstRowId = rowOrderRef.current[0]
			if (!firstRowId) return

			keyboardNavFlagRef.current = true
			const preferred: ColumnId[] = ["key", "value", "type", "actions"]
			for (const col of preferred) {
				if (cellRefs.current[firstRowId]?.[col]) {
					focusCell(firstRowId, col)
					return
				}
			}
		},
		[focusAddButton, focusCell],
	)

	useEffect(() => {
		const pendingDeleteFocus = pendingDeleteFocusRef.current
		if (!pendingDeleteFocus) return

		pendingDeleteFocusRef.current = null
		keyboardNavFlagRef.current = true

		if (
			pendingDeleteFocus.targetRowId &&
			cellRefs.current[pendingDeleteFocus.targetRowId]?.actions
		) {
			focusCell(pendingDeleteFocus.targetRowId, "actions")
		}
	})

	useEffect(() => {
		const pendingTarget = takePendingFrontmatterFocusTarget(editor.id)
		if (pendingTarget) {
			requestAnimationFrame(() => {
				applyFocusTarget(pendingTarget)
			})
		}

		const handleFrontmatterFocus = (event: Event) => {
			const detail = (
				event as CustomEvent<{
					editorId?: string
					target?: FrontmatterFocusTarget
				}>
			).detail
			if (!detail?.target || detail.editorId !== editor.id) return

			takePendingFrontmatterFocusTarget(editor.id)
			applyFocusTarget(detail.target)
		}

		window.addEventListener(FRONTMATTER_FOCUS_EVENT, handleFrontmatterFocus)
		return () => {
			window.removeEventListener(
				FRONTMATTER_FOCUS_EVENT,
				handleFrontmatterFocus,
			)
		}
	}, [applyFocusTarget, editor.id])

	return (
		<div
			className="w-full"
			onKeyDownCapture={(event) => {
				handleKeyDownCapture(event)
				handleTabNavigation(event)
				handleArrowNavigation(event)
			}}
			onPointerDownCapture={handlePointerDownCapture}
			onFocusCapture={handleFocusCapture}
			onBlurCapture={handleBlurCapture}
		>
			<table className="w-full">
				<tbody className="flex flex-col gap-2">
					{table.getRowModel().rows.map((row) => (
						<tr key={row.id} className="group flex items-start gap-1">
							{row.getVisibleCells().map((cell) => (
								<td
									key={cell.id}
									className={cn(
										cell.column.id === "value" && "flex-1 min-w-0",
										cell.column.id === "key" && "basis-48 shrink-0 w-48",
									)}
								>
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>

			<div className="mt-2">
				<Button
					onClick={addRow}
					variant="ghost"
					size="sm"
					className="rounded-sm data-[kb-nav=true]:border-ring data-[kb-nav=true]:ring-ring/50 data-[kb-nav=true]:ring-[1px]"
					ref={addButtonRef}
					onKeyDownCapture={handleAddButtonKeyDown}
				>
					<PlusIcon className="h-4 w-4 mr-2" />
					Add property
				</Button>
			</div>
		</div>
	)
}
