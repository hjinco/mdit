import { useDroppable } from "@dnd-kit/react"
import { motion } from "motion/react"
import { useCallback, useMemo, useRef, useState } from "react"
import { useShallow } from "zustand/shallow"
import { useAutoCloseSidebars } from "@/hooks/use-auto-close-sidebars"
import { useResizablePanel } from "@/hooks/use-resizable-panel"
import { cn } from "@/lib/utils"
import { useStore } from "@/store"
import { addExpandedDirectory } from "@/store/workspace/utils/expanded-directories-utils"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"
import { useFileExplorerMenus } from "./hooks/use-context-menus"
import { useDeleteShortcut } from "./hooks/use-delete-shortcut"
import { useEnterToRename } from "./hooks/use-enter-to-rename"
import { useEntryMap } from "./hooks/use-entry-map"
import { useEntryPrimaryAction } from "./hooks/use-entry-primary-action"
import { useFolderDropZone } from "./hooks/use-folder-drop-zone"
import { FeedbackButton } from "./ui/feedback-button"
import { GitSyncStatus } from "./ui/git-sync-status"
import { PinnedList } from "./ui/pinned-list"
import { RootNewFolderInput } from "./ui/root-new-folder-input"
import { SettingsMenu } from "./ui/settings-menu"
import { TopMenu } from "./ui/top-menu"
import { TreeNode } from "./ui/tree-node"
import { WorkspaceDropdown } from "./ui/workspace-dropdown"

export function FileExplorer() {
	const fileExplorerRef = useRef<HTMLElement | null>(null)
	const { isFileExplorerOpen, setFileExplorerOpen } = useStore(
		useShallow((state) => ({
			isFileExplorerOpen: state.isFileExplorerOpen,
			setFileExplorerOpen: state.setFileExplorerOpen,
		})),
	)
	const { isOpen, width, isResizing, handlePointerDown } = useResizablePanel({
		storageKey: "file-explorer-width",
		defaultWidth: 256,
		minWidth: 160,
		isOpen: isFileExplorerOpen,
		setIsOpen: setFileExplorerOpen,
	})
	const {
		workspacePath,
		entries,
		expandedDirectories,
		setExpandedDirectories,
		recentWorkspacePaths,
		toggleDirectory,
		setWorkspace,
		openFolderPicker,
		pinnedDirectories,
		pinDirectory,
		unpinDirectory,
		createNote,
		createFolder,
		deleteEntries,
		renameNoteWithAI,
		renameEntry,
		setCurrentCollectionPath,
		tab,
		openTab,
		clearLinkedTab,
		selectedEntryPaths,
		selectionAnchorPath,
		setSelectedEntryPaths,
		setSelectionAnchorPath,
		resetSelection,
	} = useStore(
		useShallow((state) => ({
			workspacePath: state.workspacePath,
			entries: state.entries,
			expandedDirectories: state.expandedDirectories,
			setExpandedDirectories: state.setExpandedDirectories,
			recentWorkspacePaths: state.recentWorkspacePaths,
			toggleDirectory: state.toggleDirectory,
			setWorkspace: state.setWorkspace,
			openFolderPicker: state.openFolderPicker,
			pinnedDirectories: state.pinnedDirectories,
			pinDirectory: state.pinDirectory,
			unpinDirectory: state.unpinDirectory,
			createNote: state.createNote,
			createFolder: state.createFolder,
			deleteEntries: state.deleteEntries,
			renameNoteWithAI: state.renameNoteWithAI,
			renameEntry: state.renameEntry,
			setCurrentCollectionPath: state.setCurrentCollectionPath,
			tab: state.tab,
			openTab: state.openTab,
			clearLinkedTab: state.clearLinkedTab,
			selectedEntryPaths: state.selectedEntryPaths,
			selectionAnchorPath: state.selectionAnchorPath,
			setSelectedEntryPaths: state.setSelectedEntryPaths,
			setSelectionAnchorPath: state.setSelectionAnchorPath,
			resetSelection: state.resetSelection,
		})),
	)
	const renameConfig = useStore((state) => state.renameConfig)
	const openImagePreview = useStore((state) => state.openImagePreview)
	const [renamingEntryPath, setRenamingEntryPath] = useState<string | null>(
		null,
	)
	const [pendingNewFolderPath, setPendingNewFolderPath] = useState<
		string | null
	>(null)
	const [aiRenamingEntryPaths, setAiRenamingEntryPaths] = useState<Set<string>>(
		() => new Set(),
	)
	const visibleEntryPaths = useMemo(() => {
		const paths: string[] = []

		const traverse = (nodes: WorkspaceEntry[]) => {
			for (const node of nodes) {
				paths.push(node.path)
				if (
					node.isDirectory &&
					expandedDirectories.includes(node.path) &&
					node.children
				) {
					traverse(node.children)
				}
			}
		}

		traverse(entries)
		return paths
	}, [entries, expandedDirectories])

	const entryOrderMap = useMemo(() => {
		const map = new Map<string, number>()
		visibleEntryPaths.forEach((path, index) => {
			map.set(path, index)
		})
		return map
	}, [visibleEntryPaths])
	const entryMap = useEntryMap(entries)

	// Setup workspace root as a drop target (for internal dnd)
	const { ref: workspaceDropRef, isDropTarget } = useDroppable({
		id: `droppable-${workspacePath}`,
		data: {
			path: workspacePath,
			isDirectory: true,
			depth: -1,
		},
		disabled: !workspacePath,
	})

	// Setup external file drop zone for workspace root
	const { isOver: isOverWorkspaceExternal, ref: workspaceExternalDropRef } =
		useFolderDropZone({
			folderPath: workspacePath ?? null,
			depth: -1,
		})

	// Combine both drop states for visual feedback
	const isOverWorkspace = isDropTarget || isOverWorkspaceExternal

	const beginRenaming = useCallback((entry: WorkspaceEntry) => {
		setRenamingEntryPath(entry.path)
	}, [])

	const cancelRenaming = useCallback(() => {
		setRenamingEntryPath(null)
	}, [])

	const handleRenameSubmit = useCallback(
		async (entry: WorkspaceEntry, nextName: string) => {
			try {
				await renameEntry(entry, nextName)
				if (tab?.path === entry.path) {
					clearLinkedTab()
				}
			} finally {
				setRenamingEntryPath(null)
			}
		},
		[clearLinkedTab, renameEntry, tab?.path],
	)

	const beginNewFolder = useCallback(
		(directoryPath: string) => {
			setPendingNewFolderPath(directoryPath)
			// Expand the parent directory to show the pending new folder input
			setExpandedDirectories((prev) =>
				addExpandedDirectory(prev, directoryPath),
			)
		},
		[setExpandedDirectories],
	)

	const cancelNewFolder = useCallback(() => {
		setPendingNewFolderPath(null)
	}, [])

	const handleNewFolderSubmit = useCallback(
		async (directoryPath: string, folderName: string) => {
			try {
				await createFolder(directoryPath, folderName)
			} catch (error) {
				console.error("Failed to create folder:", error)
			} finally {
				setPendingNewFolderPath(null)
			}
		},
		[createFolder],
	)

	useAutoCloseSidebars()

	useEnterToRename({
		containerRef: fileExplorerRef,
		selectionAnchorPath,
		renamingEntryPath,
		beginRenaming,
		entryMap,
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

	useDeleteShortcut({
		containerRef: fileExplorerRef,
		selectedEntryPaths,
		handleDeleteEntries,
	})

	const ensureDirectoryExpanded = useCallback(
		(directoryPath: string | null) => {
			if (!directoryPath) {
				return
			}

			if (expandedDirectories.includes(directoryPath)) {
				return
			}

			setExpandedDirectories((prev) =>
				addExpandedDirectory(prev, directoryPath),
			)
		},
		[expandedDirectories, setExpandedDirectories],
	)

	const createNoteAndScroll = useCallback(
		async (
			directoryPath: string,
			options?: { initialName?: string; initialContent?: string },
		) => {
			const newEntryPath = await createNote(directoryPath, options)
			ensureDirectoryExpanded(directoryPath)
			return newEntryPath
		},
		[createNote, ensureDirectoryExpanded],
	)

	const { handleEntryContextMenu, handleRootContextMenu } =
		useFileExplorerMenus({
			renameConfig,
			renameNoteWithAI,
			setAiRenamingEntryPaths,
			beginRenaming,
			beginNewFolder,
			handleDeleteEntries,
			createNote: createNoteAndScroll,
			workspacePath,
			selectedEntryPaths,
			setSelectedEntryPaths,
			setSelectionAnchorPath,
			resetSelection,
			entries,
			pinnedDirectories,
			pinDirectory,
			unpinDirectory,
		})

	const handleEntryPrimaryAction = useEntryPrimaryAction({
		entryOrderMap,
		openTab,
		selectedEntryPaths,
		selectionAnchorPath,
		setSelectedEntryPaths,
		setSelectionAnchorPath,
		visibleEntryPaths,
		openImagePreview,
		toggleDirectory,
	})

	const handleCollectionViewOpen = useCallback(
		(entry: WorkspaceEntry) => {
			setCurrentCollectionPath((prev) =>
				prev === entry.path ? null : entry.path,
			)
		},
		[setCurrentCollectionPath],
	)

	return (
		<>
			<TopMenu
				isOpen={isOpen}
				width={width}
				isResizing={isResizing}
				isFileExplorerOpen={isFileExplorerOpen}
				setFileExplorerOpen={setFileExplorerOpen}
			/>
			<motion.aside
				ref={fileExplorerRef}
				className="relative shrink-0 overflow-hidden"
				animate={{ width: isOpen ? width : 0 }}
				initial={false}
				transition={
					isResizing
						? { width: { duration: 0 } }
						: { width: { type: "spring", bounce: 0, duration: 0.12 } }
				}
			>
				<div className="shrink-0 flex flex-col h-full" style={{ width }}>
					<div className="flex items-center px-2 gap-1 mt-12">
						<WorkspaceDropdown
							workspacePath={workspacePath}
							recentWorkspacePaths={recentWorkspacePaths}
							onWorkspaceSelect={setWorkspace}
							onOpenFolderPicker={openFolderPicker}
						/>
						<GitSyncStatus />
					</div>
					<div
						ref={(node) => {
							workspaceDropRef(node)
							workspaceExternalDropRef(node)
						}}
						className={cn(
							"flex-1 overflow-y-auto px-2 pb-1 pt-0.5 mask-fade-bottom",
							isOverWorkspace &&
								"bg-blue-100/30 dark:bg-blue-900/30 ring-2 ring-inset ring-blue-400 dark:ring-blue-600",
						)}
						onContextMenu={handleRootContextMenu}
						onClick={() => {
							setSelectedEntryPaths(new Set())
						}}
					>
						{/* <TagList /> */}
						<PinnedList />
						<ul className="space-y-0.5 pb-4">
							{pendingNewFolderPath === workspacePath && workspacePath && (
								<RootNewFolderInput
									onSubmit={handleNewFolderSubmit}
									onCancel={cancelNewFolder}
									workspacePath={workspacePath}
								/>
							)}
							{entries.map((entry) => (
								<TreeNode
									key={entry.path}
									entry={entry}
									depth={0}
									expandedDirectories={expandedDirectories}
									onDirectoryClick={toggleDirectory}
									onEntryPrimaryAction={handleEntryPrimaryAction}
									onEntryContextMenu={handleEntryContextMenu}
									selectedEntryPaths={selectedEntryPaths}
									renamingEntryPath={renamingEntryPath}
									aiRenamingEntryPaths={aiRenamingEntryPaths}
									onRenameSubmit={handleRenameSubmit}
									onRenameCancel={cancelRenaming}
									pendingNewFolderPath={pendingNewFolderPath}
									onNewFolderSubmit={handleNewFolderSubmit}
									onNewFolderCancel={cancelNewFolder}
									onCollectionViewOpen={handleCollectionViewOpen}
								/>
							))}
						</ul>
					</div>
					<footer className="px-2 pb-2 flex flex-col">
						<SettingsMenu />
						<FeedbackButton />
					</footer>
				</div>
				{isOpen && (
					<div
						className="absolute top-0 -right-1 z-10 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-foreground/20 transition-colors delay-100"
						onPointerDown={handlePointerDown}
					/>
				)}
			</motion.aside>
		</>
	)
}
