import { invoke } from "@tauri-apps/api/core"

export type NativeDocument = {
	content: string
	revision: string
}

type FileConflict =
	| { status: "changed"; document: NativeDocument }
	| { status: "deleted" }

export type NativeDocumentWriteResult =
	| { status: "saved"; revision: string }
	| FileConflict

export type NativeDocumentRenameResult =
	| { status: "renamed"; revision: string }
	| FileConflict

export const nativeDocumentFiles = {
	readDocument: (path: string): Promise<NativeDocument | null> =>
		invoke("read_document_file", { path }),
	writeDocument: (input: {
		path: string
		expectedRevision: string | null
		content: string
	}): Promise<NativeDocumentWriteResult> =>
		invoke("write_document_file", input),
	renameDocument: (input: {
		oldPath: string
		newPath: string
		expectedRevision: string
	}): Promise<NativeDocumentRenameResult> =>
		invoke("rename_document_file", input),
}
