import { dirname } from "pathe"
import type {
	MoveNoteWithAIBatchResult,
	MoveNoteWithAIEntry,
	MoveNoteWithAIOperation,
} from "./types"

export type InternalOperationState = {
	path: string
	status: "pending" | "moved" | "unchanged" | "failed"
	currentDirectoryPath: string
	destinationDirPath?: string
	reason?: string
}

export function createOperationByPath(entriesToProcess: MoveNoteWithAIEntry[]) {
	return new Map<string, InternalOperationState>(
		entriesToProcess.map((entry) => [
			entry.path,
			{
				path: entry.path,
				status: "pending",
				currentDirectoryPath: dirname(entry.path),
			},
		]),
	)
}

export function toPublicOperation(
	operation: InternalOperationState,
): MoveNoteWithAIOperation {
	if (operation.status === "pending") {
		throw new Error("Pending operation cannot be returned.")
	}

	return {
		path: operation.path,
		status: operation.status,
		...(operation.destinationDirPath
			? { destinationDirPath: operation.destinationDirPath }
			: {}),
		...(operation.reason ? { reason: operation.reason } : {}),
	}
}

export function hasPendingOperations(operations: InternalOperationState[]) {
	return operations.some((operation) => operation.status === "pending")
}

export function countOperations(
	operations: MoveNoteWithAIOperation[],
): Pick<
	MoveNoteWithAIBatchResult,
	"movedCount" | "unchangedCount" | "failedCount"
> {
	return operations.reduce(
		(acc, operation) => {
			if (operation.status === "moved") {
				acc.movedCount += 1
			} else if (operation.status === "unchanged") {
				acc.unchangedCount += 1
			} else if (operation.status === "failed") {
				acc.failedCount += 1
			}
			return acc
		},
		{
			movedCount: 0,
			unchangedCount: 0,
			failedCount: 0,
		},
	)
}
