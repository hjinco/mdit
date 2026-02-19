import { ChevronRight } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { TreeNodeRenameInput } from "./tree-node-rename-input"

type RootNewFolderInputProps = {
	onSubmit: (directoryPath: string, folderName: string) => void | Promise<void>
	onCancel: () => void
	workspacePath: string
}

export function RootNewFolderInput({
	onSubmit,
	onCancel,
	workspacePath,
}: RootNewFolderInputProps) {
	const [newFolderName, setNewFolderName] = useState("")
	const inputRef = useRef<HTMLInputElement | null>(null)
	const hasSubmittedRef = useRef(false)

	useEffect(() => {
		setNewFolderName("")
		hasSubmittedRef.current = false
		requestAnimationFrame(() => {
			inputRef.current?.focus()
			inputRef.current?.select()
		})
	}, [])

	const submitNewFolder = useCallback(async () => {
		if (hasSubmittedRef.current) {
			return
		}

		const trimmedName = newFolderName.trim()

		if (!trimmedName) {
			hasSubmittedRef.current = true
			onCancel()
			return
		}

		hasSubmittedRef.current = true
		await onSubmit(workspacePath, trimmedName)
	}, [newFolderName, workspacePath, onCancel, onSubmit])

	const handleNewFolderKeyDown = useCallback(
		async (event: React.KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Enter") {
				event.preventDefault()
				await submitNewFolder()
			} else if (event.key === "Escape") {
				event.preventDefault()
				hasSubmittedRef.current = true
				onCancel()
			}
		},
		[onCancel, submitNewFolder],
	)

	const handleNewFolderBlur = useCallback(async () => {
		await submitNewFolder()
	}, [submitNewFolder])

	return (
		<li>
			<div className="flex-1 flex items-center py-0.5 ring-1 ring-ring/50 rounded-sm">
				<div className="shrink-0 px-1.5 py-1" aria-hidden="true">
					<ChevronRight className="size-4" />
				</div>
				<div className="relative flex-1 min-w-0 flex items-center">
					<span className="text-sm opacity-0">Placeholder</span>
					<TreeNodeRenameInput
						draftName={newFolderName}
						setDraftName={setNewFolderName}
						inputRef={inputRef}
						handleRenameKeyDown={handleNewFolderKeyDown}
						handleRenameBlur={handleNewFolderBlur}
					/>
				</div>
			</div>
		</li>
	)
}
