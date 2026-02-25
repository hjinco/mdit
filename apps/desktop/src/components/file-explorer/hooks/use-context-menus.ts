import {
	Menu,
	MenuItem,
	PredefinedMenuItem,
	Submenu,
} from "@tauri-apps/api/menu"
import { readTextFile } from "@tauri-apps/plugin-fs"
import {
	type Dispatch,
	type MouseEvent,
	type SetStateAction,
	useCallback,
} from "react"
import { toast } from "sonner"
import clipboard from "tauri-plugin-clipboard-api"
import { useShallow } from "zustand/shallow"
import {
	getRevealInFileManagerLabel,
	revealInFileManager,
} from "@/components/file-explorer/utils/file-manager"
import {
	getTemplateFiles,
	saveNoteAsTemplate,
} from "@/components/file-explorer/utils/template-utils"
import { useStore } from "@/store"
import type { ChatConfig } from "@/store/ai-settings/ai-settings-slice"
import type { WorkspaceEntry } from "@/store/workspace/workspace-slice"
import { isImageFile } from "@/utils/file-icon"
import { normalizePathSeparators } from "@/utils/path-utils"

const REVEAL_LABEL = getRevealInFileManagerLabel()
const REVEAL_ACCELERATOR = "CmdOrCtrl+Alt+R"
const DELETE_ACCELERATOR =
	typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")
		? "Backspace"
		: "Delete"

type UseFileExplorerMenusProps = {
	chatConfig: ChatConfig | null
	renameNoteWithAI: (entry: WorkspaceEntry) => Promise<void>
	setAiRenamingEntryPaths: Dispatch<SetStateAction<Set<string>>>
	beginRenaming: (entry: WorkspaceEntry) => void
	beginNewFolder: (directoryPath: string) => void
	handleDeleteEntries: (paths: string[]) => Promise<void>
	createNote: (
		directoryPath: string,
		options?: {
			initialName?: string
			initialContent?: string
			openTab?: boolean
		},
	) => Promise<string>
	workspacePath: string | null
	selectedEntryPaths: Set<string>
	setSelectedEntryPaths: (paths: Set<string>) => void
	setSelectionAnchorPath: (path: string | null) => void
	resetSelection: () => void
	entries: WorkspaceEntry[]
	pinnedDirectories: string[]
	pinDirectory: (path: string) => Promise<void>
	unpinDirectory: (path: string) => Promise<void>
}

export const useFileExplorerMenus = ({
	chatConfig,
	renameNoteWithAI,
	setAiRenamingEntryPaths,
	beginRenaming,
	beginNewFolder,
	handleDeleteEntries,
	createNote,
	workspacePath,
	selectedEntryPaths,
	setSelectedEntryPaths,
	setSelectionAnchorPath,
	resetSelection,
	entries,
	pinnedDirectories,
	pinDirectory,
	unpinDirectory,
}: UseFileExplorerMenusProps) => {
	const { openImageEdit, copyEntry } = useStore(
		useShallow((state) => ({
			openImageEdit: state.openImageEdit,
			copyEntry: state.copyEntry,
		})),
	)

	const showEntryMenu = useCallback(
		async (entry: WorkspaceEntry, selectionPaths: string[]) => {
			try {
				const itemPromises: Promise<MenuItem | PredefinedMenuItem>[] = []

				itemPromises.push(
					MenuItem.new({
						id: `reveal-${entry.path}`,
						text: REVEAL_LABEL,
						accelerator: REVEAL_ACCELERATOR,
						action: async () => {
							await revealInFileManager(entry.path, entry.isDirectory)
						},
					}),
				)

				itemPromises.push(
					PredefinedMenuItem.new({
						text: "Separator",
						item: "Separator",
					}),
				)

				// Add image edit option
				if (isImageFile(entry.name)) {
					itemPromises.push(
						MenuItem.new({
							id: `edit-image-${entry.path}`,
							text: "Edit Image",
							action: async () => {
								openImageEdit(entry.path)
							},
						}),
					)
					itemPromises.push(
						PredefinedMenuItem.new({
							text: "Separator",
							item: "Separator",
						}),
					)
				}

				if (entry.name.toLowerCase().endsWith(".md")) {
					itemPromises.push(
						MenuItem.new({
							id: `save-as-template-${entry.path}`,
							text: "Save as Template",
							action: async () => {
								if (!workspacePath) return
								try {
									await saveNoteAsTemplate(workspacePath, entry.path)
									toast.success(`Template saved successfully: ${entry.name}`, {
										position: "bottom-left",
									})
								} catch (error) {
									const errorMessage =
										error instanceof Error
											? error.message
											: "Failed to save template"
									toast.error(errorMessage, { position: "bottom-left" })
								}
							},
						}),
					)

					itemPromises.push(
						PredefinedMenuItem.new({
							text: "Separator",
							item: "Separator",
						}),
					)

					itemPromises.push(
						MenuItem.new({
							id: `rename-ai-${entry.path}`,
							text: "Rename with AI",
							enabled: Boolean(chatConfig),
							action: async () => {
								setAiRenamingEntryPaths((paths) => {
									const next = new Set(paths)
									next.add(entry.path)
									return next
								})
								try {
									await renameNoteWithAI(entry)
								} catch (error) {
									console.error("Failed to rename entry with AI:", error)
								} finally {
									setAiRenamingEntryPaths((paths) => {
										if (!paths.has(entry.path)) {
											return paths
										}
										const next = new Set(paths)
										next.delete(entry.path)
										return next
									})
								}
							},
						}),
					)
				}

				itemPromises.push(
					MenuItem.new({
						id: `rename-${entry.path}`,
						text: "Rename",
						action: async () => {
							beginRenaming(entry)
						},
					}),
				)

				if (selectionPaths.length > 0) {
					itemPromises.push(
						MenuItem.new({
							id: `copy-${entry.path}`,
							text: "Copy",
							accelerator: "CmdOrCtrl+C",
							action: async () => {
								await clipboard.writeFiles(selectionPaths)
							},
						}),
					)
				}

				itemPromises.push(
					MenuItem.new({
						id: `delete-${entry.path}`,
						text: "Delete",
						accelerator: DELETE_ACCELERATOR,
						action: async () => {
							const targets =
								selectionPaths.length > 0 ? selectionPaths : [entry.path]
							await handleDeleteEntries(targets)
						},
					}),
				)

				const items = await Promise.all(itemPromises)

				const menu = await Menu.new({
					items,
				})

				await menu.popup()
			} catch (error) {
				console.error("Failed to open context menu:", error)
			}
		},
		[
			beginRenaming,
			handleDeleteEntries,
			chatConfig,
			renameNoteWithAI,
			setAiRenamingEntryPaths,
			openImageEdit,
			workspacePath,
		],
	)

	const showDirectoryMenu = useCallback(
		async (directoryEntry: WorkspaceEntry, selectionPaths: string[]) => {
			const directoryPath = directoryEntry.path
			const normalizedDirectoryPath = normalizePathSeparators(directoryPath)
			const isPinned = pinnedDirectories.includes(normalizedDirectoryPath)

			// Check if clipboard contains files
			let clipboardFiles: string[] = []
			try {
				clipboardFiles = (await clipboard.readFiles()) || []
			} catch (_e) {
				// Silently fail if clipboard read fails
			}

			try {
				// Get template files
				const templateFiles = await getTemplateFiles(workspacePath)

				const items: Array<MenuItem | PredefinedMenuItem | Submenu> = [
					await MenuItem.new({
						id: `new-note-${normalizedDirectoryPath}`,
						text: "New Note",
						action: async () => {
							await createNote(directoryPath, { openTab: true })
						},
					}),
				]

				// Add template submenu
				const templateMenuItems =
					templateFiles.length === 0
						? [
								await MenuItem.new({
									id: `template-none-${normalizedDirectoryPath}`,
									text: "No templates available",
									enabled: false,
								}),
							]
						: await Promise.all(
								templateFiles.map((template) =>
									MenuItem.new({
										id: `template-${template.path}-${normalizedDirectoryPath}`,
										text: template.name,
										action: async () => {
											try {
												const templateContent = await readTextFile(
													template.path,
												)
												await createNote(directoryPath, {
													openTab: true,
													initialName: template.name,
													initialContent: templateContent,
												})
											} catch {
												toast.error("Failed to create note from template", {
													position: "bottom-left",
												})
											}
										},
									}),
								),
							)

				items.push(
					await Submenu.new({
						id: `new-note-from-template-${normalizedDirectoryPath}`,
						text: "New Note from Template",
						items: templateMenuItems,
					}),
				)

				items.push(
					await MenuItem.new({
						id: `new-folder-${normalizedDirectoryPath}`,
						text: "New Folder",
						action: async () => {
							beginNewFolder(directoryPath)
						},
					}),
					await MenuItem.new({
						id: `reveal-directory-${normalizedDirectoryPath}`,
						text: REVEAL_LABEL,
						accelerator: REVEAL_ACCELERATOR,
						action: async () => {
							await revealInFileManager(directoryPath, true)
						},
					}),
					await PredefinedMenuItem.new({
						text: "Separator",
						item: "Separator",
					}),
				)

				// Add Copy menu item if items are selected
				if (selectionPaths.length > 0) {
					items.push(
						await MenuItem.new({
							id: `copy-directory-${normalizedDirectoryPath}`,
							text: "Copy",
							accelerator: "CmdOrCtrl+C",
							action: async () => {
								await clipboard.writeFiles(selectionPaths)
							},
						}),
					)
				}

				// Add Paste menu item if clipboard contains files
				if (clipboardFiles.length > 0) {
					items.push(
						await MenuItem.new({
							id: `paste-directory-${normalizedDirectoryPath}`,
							text: "Paste",
							accelerator: "CmdOrCtrl+V",
							action: async () => {
								for (const filePath of clipboardFiles) {
									await copyEntry(filePath, directoryPath)
								}
							},
						}),
					)
				}

				if (workspacePath && directoryPath !== workspacePath) {
					items.push(
						await PredefinedMenuItem.new({
							text: "Separator",
							item: "Separator",
						}),
						await MenuItem.new({
							id: `pin-directory-${normalizedDirectoryPath}`,
							text: isPinned ? "Unpin" : "Pin",
							action: async () => {
								if (isPinned) {
									await unpinDirectory(normalizedDirectoryPath)
								} else {
									await pinDirectory(normalizedDirectoryPath)
								}
							},
						}),
					)
				}

				if (!workspacePath || directoryPath !== workspacePath) {
					items.push(
						await MenuItem.new({
							id: `rename-directory-${directoryPath}`,
							text: "Rename",
							action: async () => {
								beginRenaming(directoryEntry)
							},
						}),
					)
				}

				if (workspacePath && directoryPath !== workspacePath) {
					items.push(
						await MenuItem.new({
							id: `delete-directory-${directoryPath}`,
							text: "Delete",
							accelerator: DELETE_ACCELERATOR,
							action: async () => {
								const targets =
									selectionPaths.length > 0 ? selectionPaths : [directoryPath]
								await handleDeleteEntries(targets)
							},
						}),
					)
				}

				const menu = await Menu.new({
					items,
				})

				await menu.popup()
			} catch (error) {
				console.error("Failed to open context menu:", error)
			}
		},
		[
			beginRenaming,
			beginNewFolder,
			createNote,
			handleDeleteEntries,
			workspacePath,
			pinnedDirectories,
			pinDirectory,
			unpinDirectory,
			copyEntry,
		],
	)

	const handleEntryContextMenu = useCallback(
		async (entry: WorkspaceEntry) => {
			const isSelected = selectedEntryPaths.has(entry.path)
			let selectionTargets: string[]

			if (isSelected) {
				selectionTargets = Array.from(selectedEntryPaths)
			} else if (selectedEntryPaths.size === 1) {
				// Special case: if exactly one item is selected and user opens context menu
				// on a different entry, don't modify selection and only delete the context menu entry
				selectionTargets = [entry.path]
			} else {
				const nextSelection = new Set(selectedEntryPaths)
				const hadSelection = nextSelection.size > 0
				nextSelection.add(entry.path)
				selectionTargets = Array.from(nextSelection)
				setSelectedEntryPaths(nextSelection)
				if (!hadSelection) {
					setSelectionAnchorPath(entry.path)
				}
			}

			if (entry.isDirectory) {
				await showDirectoryMenu(entry, selectionTargets)
			} else {
				await showEntryMenu(entry, selectionTargets)
			}
		},
		[
			selectedEntryPaths,
			setSelectedEntryPaths,
			setSelectionAnchorPath,
			showDirectoryMenu,
			showEntryMenu,
		],
	)

	const handleRootContextMenu = useCallback(
		(event: MouseEvent<HTMLElement>) => {
			if (!workspacePath) return

			event.preventDefault()
			event.stopPropagation()

			resetSelection()

			showDirectoryMenu(
				{
					path: workspacePath,
					name: workspacePath.split("/").pop() ?? "Workspace",
					isDirectory: true,
					children: entries,
				},
				[],
			)
		},
		[entries, resetSelection, showDirectoryMenu, workspacePath],
	)

	return {
		handleEntryContextMenu,
		handleRootContextMenu,
	}
}
