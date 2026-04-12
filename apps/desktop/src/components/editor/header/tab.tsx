import { cn } from "@mdit/ui/lib/utils"
import { isMac } from "@mdit/utils/platform"
import { XIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { type MouseEvent, useCallback, useMemo } from "react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"

export function TabStrip() {
	const { rawTabs, openDocuments, activeTabId, activateTabById, closeTabById } =
		useStore(
			useShallow((s) => ({
				rawTabs: s.tabs,
				openDocuments: s.openDocuments,
				activeTabId: s.activeTabId,
				activateTabById: s.activateTabById,
				closeTabById: s.closeTabById,
			})),
		)
	const tabs = useMemo(() => {
		const documentsById = new Map(
			openDocuments.map((document) => [document.id, document]),
		)
		return rawTabs
			.map((tab) => {
				const document = documentsById.get(tab.documentId)
				if (!document) {
					return null
				}

				return {
					...tab,
					path: document.path,
					name: document.name,
					content: document.content,
					sessionEpoch: document.sessionEpoch,
					isSaved: document.isSaved,
				}
			})
			.filter((tab): tab is NonNullable<typeof tab> => tab !== null)
	}, [openDocuments, rawTabs])

	const handleActivate = useCallback(
		(tabId: number) => {
			activateTabById(tabId)
		},
		[activateTabById],
	)

	const handleClose = useCallback(
		(tabId: number) => {
			closeTabById(tabId)
		},
		[closeTabById],
	)

	if (tabs.length === 0) {
		return null
	}

	return (
		<div
			className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1.5"
			{...(isMac() && { "data-tauri-drag-region": "" })}
		>
			<AnimatePresence initial={false} mode="popLayout">
				{tabs.map((tab) => {
					const isActive = tab.id === activeTabId

					return (
						<motion.div
							key={tab.id}
							layout
							role="tab"
							aria-selected={isActive}
							tabIndex={0}
							onClick={() => handleActivate(tab.id)}
							onKeyDown={(event) => {
								if (event.key !== "Enter" && event.key !== " ") {
									return
								}
								event.preventDefault()
								handleActivate(tab.id)
							}}
							onAuxClick={(event) => {
								if (event.button !== 1) {
									return
								}
								event.stopPropagation()
								handleClose(tab.id)
							}}
							className={cn(
								"group/tab relative flex h-8 min-w-12 max-w-48 flex-1 basis-0 items-center rounded-md text-sm transition-colors",
								"origin-center overflow-hidden will-change-transform",
								"text-muted-foreground hover:bg-muted",
								isActive && "bg-muted text-foreground",
							)}
							initial={{ opacity: 0, x: -8 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -8 }}
							transition={{
								layout: {
									type: "spring",
									stiffness: 580,
									damping: 38,
									mass: 0.7,
								},
								opacity: {
									type: "spring",
									stiffness: 580,
									damping: 38,
									mass: 0.7,
								},
								x: {
									type: "spring",
									stiffness: 580,
									damping: 38,
									mass: 0.7,
								},
							}}
						>
							<div className="flex-1 truncate text-left pl-2 pr-1">
								{tab.name}
							</div>
							<div
								className={cn(
									"absolute right-0 flex h-full w-14 items-center justify-end rounded-r-md pr-1.5",
									"opacity-0 group-hover/tab:opacity-100 transition-opacity",
									"bg-linear-to-r from-transparent via-muted to-muted",
								)}
							>
								<button
									type="button"
									onClick={(event: MouseEvent<HTMLButtonElement>) => {
										event.stopPropagation()
										handleClose(tab.id)
									}}
									className={cn(
										"flex size-5 shrink-0 items-center justify-center transition-colors text-muted-foreground hover:text-foreground",
									)}
								>
									<XIcon className="size-3.5" aria-hidden />
									<span className="sr-only">Close tab</span>
								</button>
							</div>
						</motion.div>
					)
				})}
			</AnimatePresence>
		</div>
	)
}
