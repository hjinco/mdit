import { ChevronRight } from "lucide-react"
import { useInlineEditableInput } from "../hooks/use-inline-editable-input"
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
	const input = useInlineEditableInput({
		active: true,
		initialValue: "",
		onSubmit: async (folderName) => {
			await onSubmit(workspacePath, folderName)
		},
		onCancel,
	})

	return (
		<li>
			<div className="flex-1 flex items-center py-0.5 ring-1 ring-ring/50 rounded-sm">
				<div className="shrink-0 px-1.5 py-1" aria-hidden="true">
					<ChevronRight className="size-4" />
				</div>
				<div className="relative flex-1 min-w-0 flex items-center">
					<span className="text-sm opacity-0">Placeholder</span>
					<TreeNodeRenameInput
						value={input.value}
						setValue={input.setValue}
						inputRef={input.inputRef}
						onKeyDown={input.onKeyDown}
						onBlur={input.onBlur}
					/>
				</div>
			</div>
		</li>
	)
}
