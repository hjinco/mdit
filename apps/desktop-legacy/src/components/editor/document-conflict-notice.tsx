import { Button } from "@mdit/ui/components/button"
import { confirm } from "@tauri-apps/plugin-dialog"
import { useState } from "react"
import { toast } from "sonner"
import clipboard from "tauri-plugin-clipboard-api"

type DocumentConflictNoticeProps = {
	type: "changed" | "deleted"
	readDraft: () => string
	discardDraft: () => Promise<boolean>
}

export function DocumentConflictNotice({
	type,
	readDraft,
	discardDraft,
}: DocumentConflictNoticeProps) {
	const [isResolving, setIsResolving] = useState(false)
	const wasDeleted = type === "deleted"

	const copyDraft = async () => {
		try {
			await clipboard.writeText(readDraft())
			toast.success("Draft copied")
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to copy draft",
			)
		}
	}

	const resolveConflict = async () => {
		setIsResolving(true)
		try {
			const shouldDiscard = await confirm(
				wasDeleted
					? "Discard the unsaved draft and close this note?"
					: "Discard the unsaved draft and reload this note from disk?",
				{
					title: "Discard unsaved changes?",
					kind: "warning",
					okLabel: "Discard draft",
					cancelLabel: "Keep editing",
				},
			)
			if (shouldDiscard && !(await discardDraft())) {
				toast.error(
					"The draft is still open. Try resolving the conflict again.",
				)
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to resolve conflict",
			)
		} finally {
			setIsResolving(false)
		}
	}

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-sm">
			<p role="status">
				{wasDeleted
					? "This file was deleted on disk. Your draft is still open."
					: "This file changed on disk. Your draft is still open."}
			</p>
			<div className="flex gap-2">
				<Button variant="outline" size="sm" onClick={copyDraft}>
					Copy draft
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={isResolving}
					onClick={resolveConflict}
				>
					{wasDeleted ? "Discard draft" : "Reload from disk"}
				</Button>
			</div>
		</div>
	)
}
