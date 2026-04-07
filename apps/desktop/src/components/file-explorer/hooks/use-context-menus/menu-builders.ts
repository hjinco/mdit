import { normalizePathSeparators } from "@mdit/utils/path-utils"
import {
	Menu,
	MenuItem,
	PredefinedMenuItem,
	Submenu,
} from "@tauri-apps/api/menu"
import { readTextFile } from "@tauri-apps/plugin-fs"
import { toast } from "sonner"
import clipboard from "tauri-plugin-clipboard-api"
import { collectAIRenameTargets } from "@/components/common/explorer-agent/ai-rename-targets"
import {
	getRevealInFileManagerLabel,
	revealInFileManager,
} from "@/components/file-explorer/utils/file-manager"
import {
	getTemplateFiles,
	saveNoteAsTemplate,
} from "@/components/file-explorer/utils/template-utils"
import type { WorkspaceEntry } from "@/store"
import { isImageFile } from "@/utils/file-icon"

const REVEAL_LABEL = getRevealInFileManagerLabel()
const REVEAL_ACCELERATOR = "CmdOrCtrl+Alt+R"
const DELETE_ACCELERATOR =
	typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")
		? "Backspace"
		: "Delete"

type BaseMenuOptions = {
	beginRenaming: (entry: WorkspaceEntry) => void
	handleDeleteEntries: (paths: string[]) => Promise<void>
	hasLockedPathConflict: (paths: string[]) => boolean
	workspacePath: string | null
}

type EntryMenuOptions = BaseMenuOptions & {
	entry: WorkspaceEntry
	selectionPaths: string[]
	canRenameNoteWithAI: boolean
	renameNotesWithAI: (entries: WorkspaceEntry[]) => Promise<void>
	canMoveNotesWithAI: boolean
	moveNotesWithAI: (entries: WorkspaceEntry[]) => Promise<void>
	lookupEntryByPath: (path: string) => WorkspaceEntry | undefined
	openImageEdit: (path: string) => void
}

type DirectoryMenuOptions = BaseMenuOptions & {
	directoryEntry: WorkspaceEntry
	selectionPaths: string[]
	beginNewFolder: (directoryPath: string) => void
	createNote: (
		directoryPath: string,
		options?: {
			initialName?: string
			initialContent?: string
			openTab?: boolean
		},
	) => Promise<string>
	pinnedDirectories: string[]
	pinDirectory: (path: string) => Promise<void>
	unpinDirectory: (path: string) => Promise<void>
	copyEntry: (
		sourcePath: string,
		destinationDirectoryPath: string,
	) => Promise<string | null>
}

const separator = () =>
	PredefinedMenuItem.new({
		text: "Separator",
		item: "Separator",
	})

export const showEntryContextMenu = async ({
	entry,
	selectionPaths,
	canRenameNoteWithAI,
	renameNotesWithAI,
	canMoveNotesWithAI,
	moveNotesWithAI,
	beginRenaming,
	handleDeleteEntries,
	hasLockedPathConflict,
	lookupEntryByPath,
	openImageEdit,
	workspacePath,
}: EntryMenuOptions) => {
	try {
		const itemPromises: Promise<MenuItem | PredefinedMenuItem>[] = []
		const targets = selectionPaths.length > 0 ? selectionPaths : [entry.path]
		const hasLockedTargets = hasLockedPathConflict(targets)
		const aiRenameTargets = collectAIRenameTargets(targets, (path) =>
			lookupEntryByPath(path),
		)
		const aiMoveTargets = Array.from(
			new Map(
				selectionPaths
					.map((path) => lookupEntryByPath(path))
					.filter((target): target is WorkspaceEntry =>
						Boolean(
							target &&
								!target.isDirectory &&
								target.name.toLowerCase().endsWith(".md"),
						),
					)
					.map((target) => [target.path, target]),
			).values(),
		)

		itemPromises.push(
			MenuItem.new({
				id: `reveal-${entry.path}`,
				text: REVEAL_LABEL,
				accelerator: REVEAL_ACCELERATOR,
				action: async () => {
					await revealInFileManager(entry.path, entry.isDirectory)
				},
			}),
			separator(),
		)

		if (isImageFile(entry.name)) {
			itemPromises.push(
				MenuItem.new({
					id: `edit-image-${entry.path}`,
					text: "Edit Image",
					action: async () => {
						openImageEdit(entry.path)
					},
				}),
				separator(),
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
				separator(),
				MenuItem.new({
					id: `rename-ai-${entry.path}`,
					text: "Rename with AI",
					enabled:
						canRenameNoteWithAI &&
						aiRenameTargets.length > 0 &&
						!hasLockedTargets,
					action: async () => {
						try {
							await renameNotesWithAI(aiRenameTargets)
						} catch (error) {
							console.error("Failed to rename entry with AI:", error)
						}
					},
				}),
				MenuItem.new({
					id: `move-ai-${entry.path}`,
					text: "Move to Folder with AI",
					enabled:
						canMoveNotesWithAI && aiMoveTargets.length > 0 && !hasLockedTargets,
					action: async () => {
						try {
							await moveNotesWithAI(aiMoveTargets)
						} catch (error) {
							console.error("Failed to move entries with AI:", error)
						}
					},
				}),
			)
		}

		itemPromises.push(
			MenuItem.new({
				id: `rename-${entry.path}`,
				text: "Rename",
				enabled: !hasLockedTargets,
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
				enabled: !hasLockedTargets,
				action: async () => {
					const deleteTargets =
						selectionPaths.length > 0 ? selectionPaths : [entry.path]
					await handleDeleteEntries(deleteTargets)
				},
			}),
		)

		const items = await Promise.all(itemPromises)
		const menu = await Menu.new({ items })
		await menu.popup()
	} catch (error) {
		console.error("Failed to open context menu:", error)
	}
}

export const showDirectoryContextMenu = async ({
	directoryEntry,
	selectionPaths,
	beginRenaming,
	beginNewFolder,
	createNote,
	handleDeleteEntries,
	hasLockedPathConflict,
	workspacePath,
	pinnedDirectories,
	pinDirectory,
	unpinDirectory,
	copyEntry,
}: DirectoryMenuOptions) => {
	const directoryPath = directoryEntry.path
	const normalizedDirectoryPath = normalizePathSeparators(directoryPath)
	const isPinned = pinnedDirectories.includes(normalizedDirectoryPath)
	const targets = selectionPaths.length > 0 ? selectionPaths : [directoryPath]
	const hasLockedTargets = hasLockedPathConflict(targets)

	let clipboardFiles: string[] = []
	try {
		clipboardFiles = (await clipboard.readFiles()) || []
	} catch (_error) {
		// Ignore clipboard read failures so the rest of the menu still works.
	}

	try {
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
										const templateContent = await readTextFile(template.path)
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
			await separator(),
		)

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
				await separator(),
				await MenuItem.new({
					id: `pin-directory-${normalizedDirectoryPath}`,
					text: isPinned ? "Unpin" : "Pin",
					action: async () => {
						if (isPinned) {
							await unpinDirectory(normalizedDirectoryPath)
							return
						}
						await pinDirectory(normalizedDirectoryPath)
					},
				}),
			)
		}

		if (!workspacePath || directoryPath !== workspacePath) {
			items.push(
				await MenuItem.new({
					id: `rename-directory-${directoryPath}`,
					text: "Rename",
					enabled: !hasLockedTargets,
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
					enabled: !hasLockedTargets,
					action: async () => {
						const deleteTargets =
							selectionPaths.length > 0 ? selectionPaths : [directoryPath]
						await handleDeleteEntries(deleteTargets)
					},
				}),
			)
		}

		const menu = await Menu.new({ items })
		await menu.popup()
	} catch (error) {
		console.error("Failed to open context menu:", error)
	}
}
