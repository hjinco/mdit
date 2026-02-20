import { Button } from "@mdit/ui/components/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@mdit/ui/components/dialog"

type EmbeddingModelChangeDialogProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
}

export function EmbeddingModelChangeDialog({
	open,
	onOpenChange,
	onConfirm,
}: EmbeddingModelChangeDialogProps) {
	const handleConfirm = () => {
		onConfirm()
		onOpenChange(false)
	}

	const handleCancel = () => {
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Change Embedding Model</DialogTitle>
					<DialogDescription>
						Changing the embedding model will delete all existing indexing data.
						<br />
						Do you want to continue?
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={handleCancel}>
						Cancel
					</Button>
					<Button variant="destructive" onClick={handleConfirm}>
						Confirm
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
