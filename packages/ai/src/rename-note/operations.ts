import { join } from "pathe"
import { extractAndSanitizeName } from "./sanitize"
import type {
	RenameNoteWithAIBatchResult,
	RenameNoteWithAIDirEntry,
	RenameNoteWithAIEntry,
	RenameNoteWithAIOperation,
} from "./types"

export type InternalOperationState = {
	path: string
	status: "pending" | "renamed" | "unchanged" | "failed"
	suggestedBaseName?: string
	finalFileName?: string
	reason?: string
}

export function createOperationByPath(
	entriesToProcess: RenameNoteWithAIEntry[],
) {
	return new Map<string, InternalOperationState>(
		entriesToProcess.map((entry) => [
			entry.path,
			{
				path: entry.path,
				status: "pending",
			},
		]),
	)
}

export function toPublicOperation(
	operation: InternalOperationState,
): RenameNoteWithAIOperation {
	if (operation.status === "pending") {
		throw new Error("Pending operation cannot be returned.")
	}

	return {
		path: operation.path,
		status: operation.status,
		...(operation.suggestedBaseName
			? { suggestedBaseName: operation.suggestedBaseName }
			: {}),
		...(operation.finalFileName
			? { finalFileName: operation.finalFileName }
			: {}),
		...(operation.reason ? { reason: operation.reason } : {}),
	}
}

export function hasPendingOperations(operations: InternalOperationState[]) {
	return operations.some((operation) => operation.status === "pending")
}

export function countOperations(
	operations: RenameNoteWithAIOperation[],
): Pick<
	RenameNoteWithAIBatchResult,
	"renamedCount" | "unchangedCount" | "failedCount"
> {
	return operations.reduce(
		(acc, operation) => {
			if (operation.status === "renamed") {
				acc.renamedCount += 1
			} else if (operation.status === "unchanged") {
				acc.unchangedCount += 1
			} else if (operation.status === "failed") {
				acc.failedCount += 1
			}
			return acc
		},
		{
			renamedCount: 0,
			unchangedCount: 0,
			failedCount: 0,
		},
	)
}

async function resolveUniqueFileNameInBatch({
	suggestedBaseName,
	dirPath,
	entryName,
	exists,
	occupiedFileNamesLowerCase,
}: {
	suggestedBaseName: string
	dirPath: string
	entryName: string
	exists: (path: string) => Promise<boolean>
	occupiedFileNamesLowerCase: Set<string>
}) {
	const entryNameLowerCase = entryName.toLowerCase()

	for (let attempt = 0; attempt <= 100; attempt += 1) {
		const suffix = attempt === 0 ? "" : ` ${attempt}`
		const candidate = `${suggestedBaseName}${suffix}.md`
		const candidateLowerCase = candidate.toLowerCase()

		if (
			candidateLowerCase !== entryNameLowerCase &&
			occupiedFileNamesLowerCase.has(candidateLowerCase)
		) {
			continue
		}

		if (
			candidateLowerCase !== entryNameLowerCase &&
			(await exists(join(dirPath, candidate)))
		) {
			continue
		}

		return candidate
	}

	throw new Error("Unable to generate unique filename after 100 attempts")
}

export async function finalizeRenameOperations(params: {
	entriesToProcess: RenameNoteWithAIEntry[]
	operationByPath: Map<string, InternalOperationState>
	suggestionByPath: Map<string, string>
	dirEntries: RenameNoteWithAIDirEntry[]
	dirPath: string
	exists: (path: string) => Promise<boolean>
}) {
	const {
		entriesToProcess,
		operationByPath,
		suggestionByPath,
		dirEntries,
		dirPath,
		exists,
	} = params
	const occupiedFileNamesLowerCase = new Set(
		dirEntries
			.map((dirEntry) => dirEntry.name)
			.filter((name): name is string => typeof name === "string")
			.map((name) => name.toLowerCase()),
	)

	for (const entry of entriesToProcess) {
		const operation = operationByPath.get(entry.path)
		if (!operation) {
			throw new Error("Operation state not found for target path.")
		}

		const entryNameLowerCase = entry.name.toLowerCase()
		occupiedFileNamesLowerCase.delete(entryNameLowerCase)
		operation.suggestedBaseName = undefined
		operation.finalFileName = undefined
		operation.reason = undefined

		const rawSuggestedTitle = suggestionByPath.get(entry.path)
		if (!rawSuggestedTitle) {
			operation.status = "failed"
			operation.reason = "No rename suggestion was returned for this note."
			occupiedFileNamesLowerCase.add(entryNameLowerCase)
			continue
		}

		const suggestedBaseName = extractAndSanitizeName(rawSuggestedTitle)
		if (!suggestedBaseName) {
			operation.status = "failed"
			operation.reason = "The AI returned an invalid title."
			occupiedFileNamesLowerCase.add(entryNameLowerCase)
			continue
		}

		try {
			const finalFileName = await resolveUniqueFileNameInBatch({
				suggestedBaseName,
				dirPath,
				entryName: entry.name,
				exists,
				occupiedFileNamesLowerCase,
			})
			occupiedFileNamesLowerCase.add(finalFileName.toLowerCase())

			operation.status = finalFileName === entry.name ? "unchanged" : "renamed"
			operation.suggestedBaseName = suggestedBaseName
			operation.finalFileName = finalFileName
		} catch (error) {
			operation.status = "failed"
			operation.suggestedBaseName = suggestedBaseName
			operation.reason =
				error instanceof Error
					? error.message
					: "Failed to generate a unique file name."
			occupiedFileNamesLowerCase.add(entryNameLowerCase)
		}
	}
}
