import {
	getFolderNameFromPath,
	normalizePathSeparators,
} from "@mdit/utils/path-utils"
import { Menu, MenuItem } from "@tauri-apps/api/menu"
import { PinIcon, PinOffIcon } from "lucide-react"
import { useCallback, useMemo } from "react"
import { useShallow } from "zustand/shallow"
import type { WorkspaceEntry } from "@/store"
import { useStore } from "@/store"
import { getEntryButtonClassName } from "../utils/entry-classnames"

type PinnedListProps = {
	lookupEntryByPath: (path: string) => WorkspaceEntry | undefined
}

export function PinnedList({ lookupEntryByPath }: PinnedListProps) {
	const {
		currentCollectionPath,
		setCurrentCollectionPath,
		pinnedDirectories,
		workspacePath,
		unpinDirectory,
	} = useStore(
		useShallow((state) => ({
			currentCollectionPath: state.currentCollectionPath,
			setCurrentCollectionPath: state.setCurrentCollectionPath,
			pinnedDirectories: state.pinnedDirectories,
			workspacePath: state.workspacePath,
			unpinDirectory: state.unpinDirectory,
		})),
	)

	const normalizedWorkspacePath = useMemo(
		() => (workspacePath ? normalizePathSeparators(workspacePath) : null),
		[workspacePath],
	)

	const pinnedItems = useMemo(() => {
		return pinnedDirectories
			.map((path) => {
				const normalizedPath = normalizePathSeparators(path)
				const entry = lookupEntryByPath(path)
				const isWorkspaceRoot = normalizedWorkspacePath
					? normalizedPath === normalizedWorkspacePath
					: false
				const displayName =
					entry?.name ??
					(isWorkspaceRoot
						? normalizedWorkspacePath
							? getFolderNameFromPath(normalizedWorkspacePath)
							: normalizedPath
						: getFolderNameFromPath(normalizedPath))

				return {
					path: normalizedPath,
					name: displayName,
					exists: isWorkspaceRoot || Boolean(entry),
				}
			})
			.filter((item) => item.exists)
	}, [lookupEntryByPath, normalizedWorkspacePath, pinnedDirectories])

	const handlePinnedClick = useCallback(
		(path: string) => {
			setCurrentCollectionPath((prev) => (prev === path ? null : path))
		},
		[setCurrentCollectionPath],
	)

	const handleUnpin = useCallback(
		async (path: string) => {
			// If the unpinned item is currently selected, clear the collection path
			if (currentCollectionPath === path) {
				setCurrentCollectionPath(null)
			}
			await unpinDirectory(path)
		},
		[currentCollectionPath, unpinDirectory, setCurrentCollectionPath],
	)

	const handleUnpinClick = useCallback(
		async (path: string, event: React.MouseEvent | React.KeyboardEvent) => {
			event.preventDefault()
			event.stopPropagation()
			await handleUnpin(path)
		},
		[handleUnpin],
	)

	const handlePinnedContextMenu = useCallback(
		async (path: string, event: React.MouseEvent<HTMLButtonElement>) => {
			event.preventDefault()
			event.stopPropagation()

			try {
				const menu = await Menu.new({
					items: [
						await MenuItem.new({
							id: `unpin-${path}`,
							text: "Unpin",
							action: async () => {
								// If the unpinned item is currently selected, clear the collection path
								if (currentCollectionPath === path) {
									setCurrentCollectionPath(null)
								}
								await handleUnpin(path)
							},
						}),
					],
				})

				await menu.popup()
			} catch (error) {
				console.error("Failed to open pinned context menu:", error)
			}
		},
		[currentCollectionPath, handleUnpin, setCurrentCollectionPath],
	)

	if (pinnedItems.length === 0) {
		return null
	}

	return (
		<div className="px-2">
			<ul className="space-y-0.5">
				{pinnedItems.map((item) => {
					const isActive = currentCollectionPath === item.path

					return (
						<li key={item.path}>
							<button
								type="button"
								onClick={() => handlePinnedClick(item.path)}
								onContextMenu={(e) => handlePinnedContextMenu(item.path, e)}
								className={getEntryButtonClassName({
									isSelected: isActive,
								})}
							>
								<div
									role="button"
									tabIndex={0}
									onClick={(e) => handleUnpinClick(item.path, e)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault()
											handleUnpinClick(item.path, e)
										}
									}}
									className="shrink-0 pl-1.5 pr-0.5 translate-y-0.25 outline-none focus-visible:ring-1 focus-visible:ring-ring/50 group"
									aria-label="Unpin folder"
								>
									<PinIcon className="size-3.25 group-hover:hidden" />
									<PinOffIcon className="size-3.25 hidden group-hover:block" />
								</div>
								<div className="relative flex-1 min-w-0 truncate">
									<span className="text-sm">{item.name}</span>
								</div>
							</button>
						</li>
					)
				})}
			</ul>
		</div>
	)
}
