import { useVirtualizer } from "@tanstack/react-virtual"
import { FolderIcon } from "lucide-react"
import { type MouseEvent, useCallback, useMemo, useRef } from "react"
import { useShallow } from "zustand/shallow"
import { useResizablePanel } from "@/hooks/use-resizable-panel"
import { cn } from "@/lib/utils"
import { useStore } from "@/store"
import { getFolderNameFromPath } from "@/utils/path-utils"
import { isMac } from "@/utils/platform"
import { useCollectionContextMenu } from "./hooks/use-collection-context-menu"
import { useCollectionRename } from "./hooks/use-collection-rename"
import { useCollectionSelection } from "./hooks/use-collection-selection"
import { useCollectionSort } from "./hooks/use-collection-sort"
import { useEntryUpdateOnSave } from "./hooks/use-entry-update-on-save"
import { usePreviewCache } from "./hooks/use-preview-cache"
import { useScrollToNewEntry } from "./hooks/use-scroll-to-new-entry"
import { CollectionResizer } from "./ui/collection-resizer"
import { NewNoteButton } from "./ui/new-note-button"
import { NoteEntry } from "./ui/note-entry"
import { SortSelector } from "./ui/sort-selector"

export function CollectionView() {
	const {
		isFileExplorerOpen,
		renameConfig,
		currentCollectionPath,
		setCurrentCollectionPath,
		collectionEntries,
		tab,
		linkedTab,
		openTab,
		isSaved,
		clearLinkedTab,
		deleteEntries,
		renameNoteWithAI,
		renameEntry,
		updateEntryModifiedDate,
	} = useStore(
		useShallow((state) => ({
			isFileExplorerOpen: state.isFileExplorerOpen,
			renameConfig: state.renameConfig,
			currentCollectionPath: state.currentCollectionPath,
			setCurrentCollectionPath: state.setCurrentCollectionPath,
			collectionEntries: state.collectionEntries,
			tab: state.tab,
			linkedTab: state.linkedTab,
			openTab: state.openTab,
			isSaved: state.isSaved,
			clearLinkedTab: state.clearLinkedTab,
			deleteEntries: state.deleteEntries,
			renameNoteWithAI: state.renameNoteWithAI,
			renameEntry: state.renameEntry,
			updateEntryModifiedDate: state.updateEntryModifiedDate,
		})),
	)
	const isCollectionViewOpen = currentCollectionPath !== null
	const { isOpen, isResizing, width, handlePointerDown } = useResizablePanel({
		storageKey: "collection-view-width",
		defaultWidth: 240,
		minWidth: 200,
		isOpen: isCollectionViewOpen,
		setIsOpen: (open: boolean) => {
			setCurrentCollectionPath((prev) => (open ? prev : null))
		},
	})

	const displayName = currentCollectionPath
		? getFolderNameFromPath(currentCollectionPath)
		: undefined

	const {
		sortedEntries,
		sortOption,
		sortDirection,
		setSortOption,
		setSortDirection,
	} = useCollectionSort(collectionEntries)

	const parentRef = useRef<HTMLDivElement>(null)
	const { getPreview, setPreview, invalidatePreview } = usePreviewCache(
		currentCollectionPath,
	)

	const virtualizer = useVirtualizer({
		count: sortedEntries.length,
		getScrollElement: () => parentRef.current,
		estimateSize: (index) => {
			const entry = sortedEntries[index]
			const isMarkdown = entry.name.toLowerCase().endsWith(".md")
			// NoteEntry: ~92px (name + preview + date + padding) + 4px spacing
			// FileEntry: ~36px (name + padding) + 4px spacing
			return isMarkdown ? 96 : 40
		},
		overscan: 5,
	})

	const entryOrderMap = useMemo(() => {
		const map = new Map<string, number>()
		sortedEntries.forEach((entry, index) => {
			map.set(entry.path, index)
		})
		return map
	}, [sortedEntries])

	// Update entry metadata (preview and modified date) when the same file is saved (not when switching files)
	useEntryUpdateOnSave(
		tab?.path,
		isSaved,
		invalidatePreview,
		updateEntryModifiedDate,
	)

	const {
		selectedEntryPaths,
		setSelectedEntryPaths,
		setSelectionAnchorPath,
		resetSelection,
		handleEntryPrimaryAction,
	} = useCollectionSelection({
		entryOrderMap,
		sortedEntries,
		openTab,
	})

	const {
		renamingEntryPath,
		beginRenaming,
		cancelRenaming,
		handleRenameSubmit,
	} = useCollectionRename({
		renameEntry,
		invalidatePreview,
		onRenameSuccess: (oldPath) => {
			if (oldPath === tab?.path) {
				clearLinkedTab()
			}
		},
	})

	const handleDeleteEntries = useCallback(
		async (paths: string[]) => {
			if (paths.length === 0) {
				return
			}

			await deleteEntries(paths)
			resetSelection()
		},
		[deleteEntries, resetSelection],
	)

	const { handleEntryContextMenu } = useCollectionContextMenu({
		renameConfig,
		renameNoteWithAI,
		beginRenaming,
		handleDeleteEntries,
		selectedEntryPaths,
		setSelectedEntryPaths,
		setSelectionAnchorPath,
		resetSelection,
		invalidatePreview,
	})

	useScrollToNewEntry({
		currentCollectionPath,
		sortedEntries,
		tabPath: tab?.path,
		virtualizer,
	})

	return (
		<aside
			className="relative shrink-0 flex flex-col shadow-md"
			style={{ width, display: isOpen ? "flex" : "none" }}
		>
			<div
				className={cn(
					"h-12 flex items-center justify-between px-2",
					!isFileExplorerOpen && "justify-end",
				)}
				{...(isMac() && { "data-tauri-drag-region": "" })}
			>
				<div
					className={cn(
						"flex-1 flex items-center gap-1.5 px-1 shrink min-w-0 text-foreground/80",
						!isFileExplorerOpen && "hidden",
					)}
				>
					<FolderIcon className="size-4.5 shrink-0" />
					<h2 className="flex-1 text-sm font-medium cursor-default text-overflow-mask">
						{displayName}
					</h2>
				</div>
				<div className="flex items-center gap-1">
					<SortSelector
						value={sortOption}
						onValueChange={setSortOption}
						sortDirection={sortDirection}
						onDirectionChange={setSortDirection}
					/>
					<NewNoteButton directoryPath={currentCollectionPath} />
				</div>
			</div>
			<div
				ref={(el) => {
					parentRef.current = el
				}}
				className="flex-1 overflow-y-auto px-3"
				onClick={() => {
					setSelectedEntryPaths(new Set())
				}}
			>
				{sortedEntries.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-full">
						<p className="text-sm text-muted-foreground">
							No notes in this folder
						</p>
					</div>
				) : (
					<ul
						style={{
							height: `${virtualizer.getTotalSize()}px`,
							width: "100%",
							position: "relative",
							top: "-0.25rem",
						}}
					>
						{virtualizer.getVirtualItems().map((virtualItem) => {
							const entry = sortedEntries[virtualItem.index]
							const isActive = tab?.path === entry.path
							const isSelected = selectedEntryPaths.has(entry.path)

							const handleClick = (event: MouseEvent<HTMLLIElement>) => {
								handleEntryPrimaryAction(entry, event)
							}

							const handleContextMenu = (event: MouseEvent<HTMLLIElement>) => {
								event.preventDefault()
								event.stopPropagation()
								handleEntryContextMenu(entry)
							}

							const isMarkdown = entry.name.toLowerCase().endsWith(".md")

							return isMarkdown ? (
								<NoteEntry
									key={entry.path}
									entry={entry}
									name={
										isActive ? (linkedTab?.name ?? tab?.name ?? "") : entry.name
									}
									isActive={isActive}
									isSelected={isSelected}
									onClick={handleClick}
									onContextMenu={handleContextMenu}
									previewText={getPreview(entry.path)}
									setPreview={setPreview}
									isRenaming={renamingEntryPath === entry.path}
									onRenameSubmit={handleRenameSubmit}
									onRenameCancel={cancelRenaming}
									isScrolling={virtualizer.isScrolling}
									style={{
										position: "absolute",
										top: 0,
										left: 0,
										width: "100%",
									}}
									offsetY={virtualItem.start}
									data-index={virtualItem.index}
								/>
							) : null
							// ) : (
							//   <FileEntry
							//     key={entry.path}
							//     entry={entry}
							//     isActive={isActive}
							//     isSelected={isSelected}
							//     onClick={handleClick}
							//     onContextMenu={handleContextMenu}
							//     style={{
							//       position: 'absolute',
							//       top: 0,
							//       left: 0,
							//       width: '100%',
							//       transform: `translateY(${virtualItem.start}px)`,
							//     }}
							//     data-index={virtualItem.index}
							//   />
							// )
						})}
					</ul>
				)}
			</div>
			<CollectionResizer
				isOpen={isOpen}
				isResizing={isResizing}
				onPointerDown={handlePointerDown}
			/>
		</aside>
	)
}
