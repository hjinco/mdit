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
	onCancel: () => void
	onConfirm: () => void
}

export function EmbeddingModelChangeDialog({
	open,
	onCancel,
	onConfirm,
}: EmbeddingModelChangeDialogProps) {
	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) {
					onCancel()
				}
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Change Embedding Model</DialogTitle>
					<DialogDescription>
						Changing the embedding model will recalculate embeddings for all
						notes.
						<br />
						Do you want to continue?
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button onClick={onConfirm}>Confirm</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
