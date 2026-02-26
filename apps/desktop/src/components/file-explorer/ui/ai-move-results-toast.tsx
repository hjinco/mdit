import { Button } from "@base-ui/react/button"
import { cn } from "@mdit/ui/lib/utils"
import {
	IconAlertCircle,
	IconArrowRight,
	IconCircleCheck,
	IconInfoCircle,
	IconRotate,
} from "@tabler/icons-react"
import { useState } from "react"
import { normalizePathSeparators } from "@/utils/path-utils"

export type AIMoveResultToastItem = {
	sourcePath: string
	destinationDirPath: string
	newPath: string
}

type AIMoveResultsToastProps = {
	workspacePath: string | null
	movedCount: number
	unchangedCount: number
	failedCount: number
	items: AIMoveResultToastItem[]
	onOpenPath: (path: string) => void
	onUndo: (item: AIMoveResultToastItem) => Promise<boolean>
	onConfirm: () => void
}

type UndoStatus = "pending" | "done"

const toRelativeWorkspacePath = (
	path: string,
	workspacePath: string | null,
): string => {
	if (!workspacePath) {
		return path
	}

	const normalizedPath = normalizePathSeparators(path)
	const normalizedWorkspacePath = normalizePathSeparators(workspacePath)

	if (normalizedPath === normalizedWorkspacePath) {
		return "."
	}

	if (normalizedPath.startsWith(`${normalizedWorkspacePath}/`)) {
		return normalizedPath.slice(normalizedWorkspacePath.length + 1)
	}

	return path
}

export function AIMoveResultsToast({
	workspacePath,
	movedCount,
	unchangedCount,
	failedCount,
	items,
	onOpenPath,
	onUndo,
	onConfirm,
}: AIMoveResultsToastProps) {
	const [undoStatusByPath, setUndoStatusByPath] = useState<
		Record<string, UndoStatus>
	>({})

	const handleUndoClick = async (item: AIMoveResultToastItem) => {
		const undoStatus = undoStatusByPath[item.sourcePath]
		if (undoStatus === "pending" || undoStatus === "done") {
			return
		}

		setUndoStatusByPath((previous) => ({
			...previous,
			[item.sourcePath]: "pending",
		}))

		let didUndo = false
		try {
			didUndo = await onUndo(item)
		} catch (error) {
			console.error("Failed to undo moved entry:", item, error)
		}

		setUndoStatusByPath((previous) => {
			const next = { ...previous }
			if (didUndo) {
				next[item.sourcePath] = "done"
			} else {
				delete next[item.sourcePath]
			}
			return next
		})
	}

	return (
		<div className="w-full max-w-[430px] rounded-[18px] border border-[#dbdbd7] bg-[#f7f7f5] py-3 text-[#2f2f2f] shadow-[0_14px_34px_rgba(15,23,42,0.12)] dark:border-[#3a3a38] dark:bg-[#252524] dark:text-[#f2f2f0]">
			<div className="space-y-1.5 px-3">
				<div className="flex items-center gap-1 py-1 text-[15px] leading-none">
					<IconCircleCheck
						size={17}
						stroke={2.2}
						className="text-[#4f8a5e] dark:text-[#84c495]"
					/>
					<span>{movedCount} moved</span>
				</div>
				{unchangedCount > 0 && (
					<div className="flex items-center gap-2.5 px-2.5 py-1 text-[15px] leading-none">
						<IconInfoCircle
							size={17}
							stroke={2.2}
							className="text-[#6f6f6c] dark:text-[#a8a8a4]"
						/>
						<span>{unchangedCount} unchanged</span>
					</div>
				)}
				{failedCount > 0 && (
					<div className="flex items-center gap-2.5 px-2.5 py-1 text-[15px] leading-none">
						<IconAlertCircle
							size={17}
							stroke={2.2}
							className="text-[#ad4b49] dark:text-[#e1827f]"
						/>
						<span>{failedCount} failed</span>
					</div>
				)}
			</div>

			<div className="max-h-[288px] overflow-y-auto px-3">
				{items.length === 0 ? (
					<div className="py-8 text-center">
						<p className="text-[13px] italic text-[#888883] dark:text-[#a2a29c]">
							No notes were moved.
						</p>
					</div>
				) : (
					<div>
						{items.map((item) => {
							const undoStatus = undoStatusByPath[item.sourcePath]
							const isUndoPending = undoStatus === "pending"
							const isUndoDone = undoStatus === "done"
							const isUndoDisabled = isUndoPending || isUndoDone

							return (
								<div
									key={item.sourcePath}
									className="relative flex items-start justify-between gap-3 py-2.5"
								>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-1.5 overflow-hidden">
											<IconArrowRight
												size={12}
												className="shrink-0 text-[#8a8a85] dark:text-[#8f8f89]"
											/>
											<button
												type="button"
												className="truncate text-left text-[15px] font-medium cursor-pointer text-[#2f2f2f] transition-colors hover:text-[#191919] hover:underline dark:text-[#ededea] dark:hover:text-[#ffffff]"
												onClick={() => onOpenPath(item.newPath)}
											>
												{toRelativeWorkspacePath(item.newPath, workspacePath)}
											</button>
										</div>
										<p className="mt-0.5 truncate pl-[18px] text-[12px] text-[#7f7f7b] dark:text-[#a5a5a0]">
											from{" "}
											{toRelativeWorkspacePath(item.sourcePath, workspacePath)}
										</p>
									</div>

									<Button
										type="button"
										className={cn(
											"flex shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-[12px] font-medium outline-none select-none",
											!isUndoDisabled
												? "cursor-pointer text-[#6d6d68] hover:bg-[#e9e9e7] hover:text-[#2f2f2f] dark:text-[#aaa9a3] dark:hover:bg-[#333331] dark:hover:text-[#f2f2ee]"
												: "cursor-default opacity-45",
											isUndoDone && "text-muted-foreground",
										)}
										disabled={isUndoDisabled}
										onClick={() => void handleUndoClick(item)}
									>
										<IconRotate size={14} stroke={2.2} />
										<span>Undo</span>
									</Button>
								</div>
							)
						})}
					</div>
				)}
			</div>

			<div className="px-3 flex justify-end">
				<Button
					type="button"
					className="cursor-pointer rounded-[8px] bg-[#2f2f2f] px-3.5 py-1.5 text-[12px] font-semibold text-[#f7f7f5] transition-colors hover:bg-[#1f1f1f] focus-visible:ring-2 focus-visible:ring-[#a8a8a2] focus-visible:ring-offset-1 focus-visible:ring-offset-[#f7f7f5] dark:bg-[#f2f2ef] dark:text-[#252524] dark:hover:bg-[#ffffff] dark:focus-visible:ring-offset-[#252524]"
					onClick={onConfirm}
				>
					Done
				</Button>
			</div>
		</div>
	)
}
