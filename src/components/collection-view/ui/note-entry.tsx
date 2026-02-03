import { formatDistanceToNow } from "date-fns"
import { motion } from "motion/react"
import {
	type CSSProperties,
	type MouseEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react"
import { cn } from "@/lib/utils"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"

type NoteEntryProps = {
	entry: WorkspaceEntry
	name: string
	isActive: boolean
	isSelected: boolean
	onClick: (event: MouseEvent<HTMLLIElement>) => void
	onContextMenu: (event: MouseEvent<HTMLLIElement>) => void
	previewText?: string
	setPreview: (path: string) => Promise<void>
	isRenaming?: boolean
	onRenameSubmit: (entry: WorkspaceEntry, newName: string) => Promise<void>
	onRenameCancel: () => void
	style?: CSSProperties
	offsetY: number
	isScrolling: boolean
	"data-index"?: number
}

export function NoteEntry({
	entry,
	name,
	isActive,
	isSelected,
	onClick,
	onContextMenu,
	previewText,
	setPreview,
	isRenaming = false,
	onRenameSubmit,
	onRenameCancel,
	style,
	offsetY,
	isScrolling,
	"data-index": dataIndex,
}: NoteEntryProps) {
	useEffect(() => {
		// If preview is already available, no need to fetch
		if (previewText !== undefined) {
			return
		}

		setPreview(entry.path)
	}, [entry.path, previewText, setPreview])

	// Remove extension from display name
	// Use entry.name for extension extraction since it always includes the extension
	const entryLastDotIndex = entry.name.lastIndexOf(".")
	const extension =
		entryLastDotIndex > 0 ? entry.name.slice(entryLastDotIndex) : ""
	// baseName is for display, use name prop (which may or may not have extension)
	const baseName = isActive ? name : entry.name.slice(0, entryLastDotIndex)

	const [draftName, setDraftName] = useState(baseName)
	const inputRef = useRef<HTMLInputElement | null>(null)
	const hasSubmittedRef = useRef(false)

	useEffect(() => {
		if (isRenaming) {
			setDraftName(baseName)
			hasSubmittedRef.current = false
			requestAnimationFrame(() => {
				inputRef.current?.focus()
				inputRef.current?.select()
			})
		} else {
			hasSubmittedRef.current = false
		}
	}, [baseName, isRenaming])

	const submitRename = useCallback(async () => {
		if (hasSubmittedRef.current) {
			return
		}

		const trimmedName = draftName.trim()

		if (!trimmedName) {
			hasSubmittedRef.current = true
			onRenameCancel()
			return
		}

		let finalName = trimmedName

		if (extension) {
			if (trimmedName.endsWith(extension)) {
				finalName = trimmedName
			} else {
				finalName = `${trimmedName}${extension}`
			}
		}

		hasSubmittedRef.current = true
		await onRenameSubmit(entry, finalName)
	}, [draftName, entry, extension, onRenameCancel, onRenameSubmit])

	const handleRenameKeyDown = useCallback(
		async (event: React.KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Enter") {
				event.preventDefault()
				await submitRename()
			} else if (event.key === "Escape") {
				event.preventDefault()
				hasSubmittedRef.current = true
				onRenameCancel()
			}
		},
		[onRenameCancel, submitRename],
	)

	const handleRenameBlur = useCallback(async () => {
		await submitRename()
	}, [submitRename])

	const isPreviewLoaded = previewText !== undefined
	const baseStyle: CSSProperties = {
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		...style,
	}

	const transition = isScrolling
		? { y: { duration: 0 } }
		: { y: { type: "spring" as const, bounce: 0, duration: 0.2 } }

	return (
		<motion.li
			onClick={onClick}
			onContextMenu={onContextMenu}
			style={baseStyle}
			animate={{ y: offsetY }}
			initial={false}
			transition={transition}
			data-index={dataIndex}
		>
			<div
				className={cn(
					"py-2 text-foreground flex flex-col gap-1 mb-1 cursor-pointer transition-opacity duration-300",
					isPreviewLoaded &&
						"opacity-20 group-hover/side:opacity-50 hover:opacity-100",
					isPreviewLoaded &&
						(isActive || isSelected) &&
						"opacity-100 group-hover/side:opacity-100",
					!isPreviewLoaded && "opacity-0",
				)}
			>
				<div className="flex relative">
					<div
						className={cn(
							"relative flex-1 text-base font-medium h-6 text-overflow-mask",
							isRenaming && "invisible",
						)}
					>
						{baseName}
					</div>
					{isRenaming && (
						<input
							ref={inputRef}
							value={draftName}
							onChange={(event) => setDraftName(event.target.value)}
							onKeyDown={handleRenameKeyDown}
							onBlur={handleRenameBlur}
							className="absolute inset-0 h-full truncate text-base font-medium outline-none"
							spellCheck={false}
							autoComplete="off"
							onClick={(e) => e.stopPropagation()}
						/>
					)}
				</div>
				<div className="text-xs text-foreground/80 line-clamp-2 min-h-8 break-words">
					{previewText}
				</div>
				{entry.modifiedAt && (
					<div className="text-xs text-foreground/70">
						{formatDistanceToNow(entry.modifiedAt, { addSuffix: true })}
					</div>
				)}
			</div>
		</motion.li>
	)
}
