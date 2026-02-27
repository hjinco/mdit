import { useInlineEditableInput } from "../hooks/use-inline-editable-input"
import { TreeInlineEditRow } from "./tree-inline-edit-row"

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
			<TreeInlineEditRow
				value={input.value}
				setValue={input.setValue}
				inputRef={input.inputRef}
				onKeyDown={input.onKeyDown}
				onBlur={input.onBlur}
				iconClassName="px-1.5"
			/>
		</li>
	)
}
