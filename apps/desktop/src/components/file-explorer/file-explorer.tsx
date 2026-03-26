import { useDroppable } from "@dnd-kit/react"
import { motion } from "motion/react"
import { useCallback, useRef, useState } from "react"
import { useShallow } from "zustand/shallow"
import { useMoveNotesWithAI } from "@/components/common/explorer-agent/hooks/use-move-notes-with-ai"
import { useRenameNoteWithAI } from "@/components/common/explorer-agent/hooks/use-rename-note-with-ai"
import { useAutoCloseSidebars } from "@/hooks/use-auto-close-sidebars"
import { useResizablePanel } from "@/hooks/use-resizable-panel"
import { useStore } from "@/store"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"
import { hasPathConflictWithLockedPaths } from "@/utils/path-utils"
import { FeedbackButton } from "./feedback"
import { useFileExplorerMenus } from "./hooks/use-context-menus"
import { useDeleteShortcut } from "./hooks/use-delete-shortcut"
import { useDesktopFileTree } from "./hooks/use-desktop-file-tree"
import { useEnterToRename } from "./hooks/use-enter-to-rename"
import { useEntryPrimaryAction } from "./hooks/use-entry-primary-action"
import { useFolderDropZone } from "./hooks/use-folder-drop-zone"
import { RootNewFolderInput, TreeNode } from "./tree"
import { GitSyncStatus } from "./ui/git-sync-status"
import { GraphViewOpenButton } from "./ui/graph-view-open-button"
import { PinnedList } from "./ui/pinned-list"
import { SettingsMenu } from "./ui/settings-menu"
import { TopMenu } from "./ui/top-menu"
import { UpdateButton } from "./ui/update-button"
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
		expandDirectory,
		setExpandedDirectories,
		recentWorkspacePaths,
		setWorkspace,
		removeWorkspaceFromHistory,
		openFolderPicker,
		pinnedDirectories,
		pinDirectory,
		unpinDirectory,
		createNote,
		createFolder,
		deleteEntries,
		renameEntry,
		setCurrentCollectionPath,
		tab,
		openTab,
		clearLinkedTab,
		aiLockedEntryPaths,
		selectedEntryPaths,
		selectionAnchorPath,
		setEntrySelection,
		resetSelection,
		lockAiEntries,
		unlockAiEntries,
	} = useStore(
		useShallow((state) => ({
			workspacePath: state.workspacePath,
			entries: state.entries,
			expandedDirectories: state.expandedDirectories,
			expandDirectory: state.expandDirectory,
			setExpandedDirectories: state.setExpandedDirectories,
			recentWorkspacePaths: state.recentWorkspacePaths,
			setWorkspace: state.setWorkspace,
			removeWorkspaceFromHistory: state.removeWorkspaceFromHistory,
			openFolderPicker: state.openFolderPicker,
			pinnedDirectories: state.pinnedDirectories,
			pinDirectory: state.pinDirectory,
			unpinDirectory: state.unpinDirectory,
			createNote: state.createNote,
			createFolder: state.createFolder,
			deleteEntries: state.deleteEntries,
			renameEntry: state.renameEntry,
			setCurrentCollectionPath: state.setCurrentCollectionPath,
			tab: state.tab,
			openTab: state.openTab,
			clearLinkedTab: state.clearLinkedTab,
			aiLockedEntryPaths: state.aiLockedEntryPaths,
			selectedEntryPaths: state.selectedEntryPaths,
			selectionAnchorPath: state.selectionAnchorPath,
			setEntrySelection: state.setEntrySelection,
			resetSelection: state.resetSelection,
			lockAiEntries: state.lockAiEntries,
			unlockAiEntries: state.unlockAiEntries,
		})),
	)
	const openImagePreview = useStore((state) => state.openImagePreview)
	const [renamingEntryPath, setRenamingEntryPath] = useState<string | null>(
		null,
	)
	const [pendingNewFolderPath, setPendingNewFolderPath] = useState<
		string | null
	>(null)
	const { renameNotesWithAI, canRenameNoteWithAI } = useRenameNoteWithAI()
	const { moveNotesWithAI, canMoveNotesWithAI } = useMoveNotesWithAI()
	const { tree, nodeById, handleItemPress, toggleExpanded, lookupEntryByPath } =
		useDesktopFileTree({
			entries,
			expandedDirectories,
			selectedEntryPaths,
			selectionAnchorPath,
			renamingEntryPath,
			pendingNewFolderPath,
			aiLockedEntryPaths,
			activeTabPath: tab?.path ?? null,
			setExpandedDirectories,
			setEntrySelection,
		})

	const hasLockedPathConflict = useCallback(
		(paths: string[]) =>
			hasPathConflictWithLockedPaths(paths, aiLockedEntryPaths),
		[aiLockedEntryPaths],
	)

	// Setup workspace root as a drop target (for internal dnd)
	const { ref: workspaceDropRef } = useDroppable({
		id: `droppable-${workspacePath}`,
		data: {
			path: workspacePath,
			isDirectory: true,
			depth: -1,
		},
		disabled: !workspacePath || !isFileExplorerOpen,
	})

	// Setup external file drop zone for workspace root
	const { ref: workspaceExternalDropRef } = useFolderDropZone({
		folderPath: workspacePath ?? null,
		depth: -1,
	})

	const beginRenaming = useCallback(
		(entry: WorkspaceEntry) => {
			if (hasLockedPathConflict([entry.path])) {
				return
			}
			if (renamingEntryPath && renamingEntryPath !== entry.path) {
				unlockAiEntries([renamingEntryPath])
			}
			lockAiEntries([entry.path])
			setRenamingEntryPath(entry.path)
		},
		[hasLockedPathConflict, lockAiEntries, renamingEntryPath, unlockAiEntries],
	)

	const cancelRenaming = useCallback(() => {
		if (renamingEntryPath) {
			unlockAiEntries([renamingEntryPath])
		}
		setRenamingEntryPath(null)
	}, [renamingEntryPath, unlockAiEntries])

	const handleRenameSubmit = useCallback(
		async (entry: WorkspaceEntry, nextName: string) => {
			try {
				await renameEntry(entry, nextName, { allowLockedSourcePath: true })
				if (tab?.path === entry.path) {
					clearLinkedTab()
				}
			} finally {
				unlockAiEntries([entry.path])
				setRenamingEntryPath(null)
			}
		},
		[clearLinkedTab, renameEntry, tab?.path, unlockAiEntries],
	)

	const beginNewFolder = useCallback(
		(directoryPath: string) => {
			setPendingNewFolderPath(directoryPath)
			expandDirectory(directoryPath).catch((error) => {
				console.error("Failed to expand directory:", error)
			})
		},
		[expandDirectory],
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
		nodeById,
	})

	const handleDeleteEntries = useCallback(
		async (paths: string[]) => {
			if (paths.length === 0) {
				return
			}
			if (hasLockedPathConflict(paths)) {
				return
			}

			await deleteEntries(paths)
			resetSelection()
		},
		[deleteEntries, hasLockedPathConflict, resetSelection],
	)

	useDeleteShortcut({
		containerRef: fileExplorerRef,
		selectedEntryPaths,
		hasLockedPathConflict,
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

			expandDirectory(directoryPath).catch((error) => {
				console.error("Failed to expand directory:", error)
			})
		},
		[expandedDirectories, expandDirectory],
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
			canRenameNoteWithAI,
			renameNotesWithAI,
			canMoveNotesWithAI,
			moveNotesWithAI,
			beginRenaming,
			beginNewFolder,
			handleDeleteEntries,
			hasLockedPathConflict,
			createNote: createNoteAndScroll,
			workspacePath,
			selectedEntryPaths,
			selectionAnchorPath,
			setEntrySelection,
			resetSelection,
			lookupEntryByPath,
			entries,
			pinnedDirectories,
			pinDirectory,
			unpinDirectory,
		})

	const handleEntryPrimaryAction = useEntryPrimaryAction({
		handleItemPress,
		openTab,
		openImagePreview,
		toggleExpanded,
	})

	const handleCollectionViewOpen = useCallback(
		(entry: WorkspaceEntry) => {
			setCurrentCollectionPath((prev) =>
				prev === entry.path ? null : entry.path,
			)
		},
		[setCurrentCollectionPath],
	)

	const handleExplorerPointerDownCapture = useCallback(
		(event: React.PointerEvent<HTMLElement>) => {
			const target = event.target as HTMLElement | null
			if (
				target?.tagName === "INPUT" ||
				target?.tagName === "TEXTAREA" ||
				target?.isContentEditable
			) {
				return
			}
			fileExplorerRef.current?.focus()
		},
		[],
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
				className="relative shrink-0 overflow-hidden focus:outline-none focus-visible:outline-none"
				tabIndex={-1}
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
							onWorkspaceRemove={removeWorkspaceFromHistory}
							onOpenFolderPicker={openFolderPicker}
						/>
						<GitSyncStatus />
					</div>
					<div
						ref={(node) => {
							workspaceDropRef(node)
							workspaceExternalDropRef(node)
						}}
						className="flex flex-1 min-h-0 flex-col"
						onPointerDownCapture={handleExplorerPointerDownCapture}
						onContextMenu={handleRootContextMenu}
						onClick={resetSelection}
					>
						<PinnedList lookupEntryByPath={lookupEntryByPath} />
						<div className="min-h-0 flex-1 px-2 pb-4 pt-0.5 overflow-y-auto overscroll-none mask-fade-bottom">
							<ul className="space-y-0.5">
								{pendingNewFolderPath === workspacePath && workspacePath && (
									<RootNewFolderInput
										onSubmit={handleNewFolderSubmit}
										onCancel={cancelNewFolder}
										workspacePath={workspacePath}
									/>
								)}
								{tree.map((node) => (
									<TreeNode
										key={node.path}
										node={node}
										isFileExplorerOpen={isFileExplorerOpen}
										onDirectoryClick={toggleExpanded}
										onEntryPrimaryAction={handleEntryPrimaryAction}
										onEntryContextMenu={handleEntryContextMenu}
										onRenameSubmit={handleRenameSubmit}
										onRenameCancel={cancelRenaming}
										onNewFolderSubmit={handleNewFolderSubmit}
										onNewFolderCancel={cancelNewFolder}
										onCollectionViewOpen={handleCollectionViewOpen}
									/>
								))}
							</ul>
						</div>
					</div>
					<footer className="px-2 pb-2 flex flex-col">
						<UpdateButton />
						<GraphViewOpenButton disabled={!workspacePath} />
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
