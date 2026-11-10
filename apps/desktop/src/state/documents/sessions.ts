import { getFileNameFromPath } from "@mdit/utils/path-utils"
import { getPortableNoteTitleValidationError } from "@mdit/utils/portable-filename"
import { dirname, extname, join } from "pathe"
import type {
	DocumentConflict,
	DocumentDraft,
	DocumentSnapshotProvider,
	DocumentWorkspaceDependencies,
	OpenDocument,
} from "./types"

export function createDocumentSessions({
	deps,
	getDocument,
	updateDocument,
	remap,
	reserveRename,
	waitForRemap,
}: {
	deps: DocumentWorkspaceDependencies
	getDocument: (id: number) => OpenDocument | undefined
	updateDocument: (
		id: number,
		update: (document: OpenDocument) => OpenDocument,
	) => void
	remap: (oldPath: string, newPath: string, revision: string) => void
	reserveRename: (oldPath: string, newPath: string) => () => void
	waitForRemap: (id: number) => Promise<void> | undefined
}) {
	const sessions = new Map<
		number,
		ReturnType<typeof createDocumentSaveSession>
	>()
	const pendingWrites = new Map<number, { path: string; content: string }>()
	const pendingRenames = new Map<number, string>()

	const conflict = (id: number, next: DocumentConflict) => {
		const previous = getDocument(id)?.conflict
		if (
			previous?.type === next.type &&
			(next.type === "deleted" ||
				(previous.type === "changed" && previous.content === next.content))
		) {
			return
		}

		updateDocument(id, (document) => ({
			...document,
			conflict: next,
			isSaved: false,
		}))
		sessions.get(id)?.markConflict()
	}

	const getOrCreate = (id: number) => {
		const existing = sessions.get(id)
		if (existing) {
			return existing
		}

		const session = createDocumentSaveSession({
			write: async ({ content, title }) => {
				const remapping = waitForRemap(id)
				if (remapping) {
					await remapping
				}
				const document = getDocument(id)
				if (!document || document.conflict) {
					return false
				}

				const { path, diskRevision } = document
				pendingWrites.set(id, { path, content })
				let savedRevision: string
				try {
					const result = await deps.writeDocument({
						path,
						expectedRevision: diskRevision,
						content,
					})
					if (getDocument(id)?.path !== path) {
						return false
					}
					if (result.status !== "saved") {
						conflict(
							id,
							result.status === "deleted"
								? { type: "deleted" }
								: { type: "changed", content: result.document.content },
						)
						return false
					}

					savedRevision = result.revision
					updateDocument(id, (current) => ({
						...current,
						content,
						diskRevision: savedRevision,
					}))
					deps.onSaved?.(path)
				} finally {
					pendingWrites.delete(id)
				}

				const nextFileName = `${title}${extname(path)}`
				if (
					!title ||
					getFileNameFromPath(path) === nextFileName ||
					getPortableNoteTitleValidationError(title)
				) {
					return true
				}
				if (getDocument(id)?.conflict) {
					return false
				}

				const newPath = join(dirname(path), nextFileName)
				if (deps.isRenameBlocked?.(path, newPath)) {
					throw new Error(
						"The note is busy. Try renaming it again once the current operation finishes.",
					)
				}
				const releaseRename = reserveRename(path, newPath)
				pendingRenames.set(id, path)
				try {
					const renamed = await deps.renameDocument({
						oldPath: path,
						newPath,
						expectedRevision: savedRevision,
					})
					if (renamed.status !== "renamed") {
						conflict(
							id,
							renamed.status === "deleted"
								? { type: "deleted" }
								: { type: "changed", content: renamed.document.content },
						)
						return false
					}

					remap(path, newPath, renamed.revision)
					await deps.onRenamed?.(path, newPath)
					return true
				} finally {
					pendingRenames.delete(id)
					releaseRename()
				}
			},
			onChange: (isSaved) =>
				updateDocument(id, (document) =>
					document.isSaved === isSaved ? document : { ...document, isSaved },
				),
			onError: deps.reportSaveError,
		})
		sessions.set(id, session)
		if (getDocument(id)?.conflict) {
			session.markConflict()
		}
		return session
	}

	return {
		getOrCreate,
		get: (id: number) => sessions.get(id),
		delete: (id: number) => sessions.delete(id),
		conflict,
		isPendingRename: (id: number, path: string) =>
			pendingRenames.get(id) === path,
		isPendingWrite: (id: number, path: string, content: string) => {
			const pending = pendingWrites.get(id)
			return pending?.path === path && pending.content === content
		},
	}
}

function createDocumentSaveSession({
	write,
	onChange,
	onError,
}: {
	write: (draft: DocumentDraft) => Promise<boolean>
	onChange: (isSaved: boolean) => void
	onError: (error: unknown) => void
}) {
	let editRevision = 0
	let savedRevision = 0
	let blocked = false
	let provider: DocumentSnapshotProvider | undefined
	let inFlight: Promise<boolean> | undefined

	const isSaved = () => editRevision === savedRevision && !inFlight && !blocked

	const writeNextDraft = () => {
		if (inFlight) {
			return inFlight
		}
		const revision = editRevision
		let snapshot: DocumentDraft | null | undefined
		try {
			snapshot = provider?.()
		} catch (error) {
			onError(error)
			return Promise.resolve(false)
		}
		if (!snapshot) {
			return Promise.resolve(false)
		}
		const draft = { ...snapshot }
		inFlight = Promise.resolve().then(async () => {
			try {
				if (blocked || !(await write(draft))) {
					return false
				}
				savedRevision = revision
				return !blocked
			} catch (error) {
				onError(error)
				return false
			} finally {
				inFlight = undefined
				onChange(isSaved())
			}
		})
		return inFlight
	}

	const requestSave = async () => {
		const requestedRevision = editRevision
		while (!blocked && requestedRevision > savedRevision) {
			if (!(await writeNextDraft())) {
				return false
			}
		}
		return !blocked
	}

	return {
		register: (nextProvider: DocumentSnapshotProvider) => {
			const registration = () => nextProvider()
			provider = registration
			return () => {
				if (provider === registration) {
					provider = undefined
				}
			}
		},
		recordEdit: () => {
			editRevision += 1
			onChange(false)
		},
		markConflict: () => {
			blocked = true
			onChange(false)
		},
		editRevision: () => editRevision,
		isWriting: () => Boolean(inFlight),
		requestSave,
		flush: async () => {
			while (!isSaved() && !blocked) {
				if (!(await requestSave())) {
					return false
				}
			}
			return !blocked
		},
	}
}
