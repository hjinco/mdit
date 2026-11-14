import { createMarkdownDeserializerWithFallback } from "@mdit/editor/markdown"
import { NodeApi, usePlateEditor, type Value } from "@mdit/editor/plate"
import { EditorSurface } from "@mdit/editor/shared"
import {
	getEditorTitleText,
	injectEditorTitleBlock,
	NOTE_TITLE_KEY,
	stripEditorTitleBlock,
} from "@mdit/editor/title"
import {
	type KeyboardEvent,
	type MouseEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import {
	useDesktopRuntime,
	useDocumentState,
	useWindowState,
	useWorkspaceState,
} from "@/state"
import type { OpenDocument } from "@/state/documents/types"
import { isMac } from "@/utils/platform"
import { DocumentConflictNotice } from "./document-conflict-notice"
import { Header } from "./header/header"
import { useCommandMenuSelectionRestore } from "./hooks/use-command-menu-selection-restore"
import { useExternalImageDrop } from "./hooks/use-external-image-drop"
import {
	createEditorKit,
	EditorKit,
	EditorKitNoMdx,
} from "./plugins/editor-kit"
import {
	focusEditorAtDefaultSelection,
	restoreHistorySelection,
	toTabHistorySelection,
} from "./utils/history-restore-utils"
import { restoreSelectionOnEditorActivate } from "./utils/restore-selection-on-activate"
import { resolveTitleSaveIntent } from "./utils/title-save-intent"

export function Editor({ hideNavigation }: { hideNavigation?: boolean }) {
	const { handleTypingProgress } = useDesktopRuntime().window.commands
	const openDocuments = useDocumentState((state) => state.openDocuments)
	const activeTab = useDocumentState(
		(state) => state.tabs.find((tab) => tab.id === state.activeTabId) ?? null,
	)

	const deserializeWithFallback = useMemo(
		() =>
			createMarkdownDeserializerWithFallback({
				mdxPlugins: EditorKit,
				noMdxPlugins: EditorKitNoMdx,
			}),
		[],
	)

	if (!activeTab) {
		return (
			<div className="relative max-w-full w-full overflow-hidden flex flex-col bg-background shadow">
				<Header hideNavigation={hideNavigation} />
				<div className="relative min-h-0 flex-1">
					<div className="h-full bg-background">
						<div
							className="h-full w-full"
							{...(isMac() && { "data-tauri-drag-region": "" })}
						/>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div className="relative max-w-full w-full overflow-hidden flex flex-col bg-background shadow">
			<Header hideNavigation={hideNavigation} />
			<div className="relative min-h-0 flex-1">
				{openDocuments.map((document) => {
					const tab = document.id === activeTab.documentId ? activeTab : null
					return (
						<EditorPane
							key={document.id}
							document={document}
							activeTabId={tab?.id ?? null}
							activeHistoryIndex={tab?.historyIndex ?? null}
							deserializeWithFallback={deserializeWithFallback}
							onTypingProgress={handleTypingProgress}
						/>
					)
				})}
			</div>
		</div>
	)
}

function EditorPane({
	document,
	activeTabId,
	activeHistoryIndex,
	deserializeWithFallback,
	onTypingProgress,
}: {
	document: OpenDocument
	activeTabId: number | null
	activeHistoryIndex: number | null
	deserializeWithFallback: (input: { content: string; path: string }) => Value
	onTypingProgress: () => void
}) {
	const active = activeTabId !== null

	return (
		<div
			className={active ? "block h-full" : "hidden h-full"}
			aria-hidden={!active}
		>
			<EditorContent
				key={`${document.id}:${document.sessionEpoch}`}
				documentId={document.id}
				sessionEpoch={document.sessionEpoch}
				activeTabId={activeTabId}
				activeHistoryIndex={activeHistoryIndex}
				path={document.path}
				initialContent={document.content}
				deserializeWithFallback={deserializeWithFallback}
				conflictType={document.conflict?.type}
				onTypingProgress={onTypingProgress}
			/>
		</div>
	)
}

function EditorContent({
	documentId,
	sessionEpoch,
	activeTabId,
	activeHistoryIndex,
	path,
	initialContent,
	deserializeWithFallback,
	conflictType,
	onTypingProgress,
}: {
	documentId: number
	sessionEpoch: number
	activeTabId: number | null
	activeHistoryIndex: number | null
	path: string
	initialContent: string
	deserializeWithFallback: (input: { content: string; path: string }) => Value
	conflictType?: "changed" | "deleted"
	onTypingProgress: () => void
}) {
	const active = activeTabId !== null
	const [value] = useState(() =>
		injectEditorTitleBlock(
			path,
			deserializeWithFallback({ content: initialContent, path }),
		),
	)
	const titleState = useRef({
		baseline: getEditorTitleText(value),
		lastRequested: "",
	})
	const lastPathRef = useRef(path)
	const lastActiveRef = useRef({
		active,
		tabId: activeTabId,
		path,
	})
	const runtime = useDesktopRuntime()
	const {
		discardDocumentChanges,
		getDocumentById,
		recordDocumentEdit,
		registerDocumentSnapshotProvider,
		requestDocumentSave,
		setTabHistorySelectionProvider,
		consumeTabPendingHistorySelectionRestore,
	} = runtime.documents.commands
	const { resetFocusMode } = runtime.window.commands
	const isFocusMode = useWindowState((state) => state.isFocusMode)
	const workspacePath = useWorkspaceState((state) => state.workspacePath)
	const editorContainerRef = useRef<HTMLDivElement | null>(null)
	const requestSave = useCallback(() => {
		void requestDocumentSave(documentId)
	}, [documentId, requestDocumentSave])
	const plugins = useMemo(
		() => createEditorKit({ documentId, onTitleExit: requestSave }),
		[documentId, requestSave],
	)

	const editor = usePlateEditor({
		chunking: {
			chunkSize: 500,
			contentVisibilityAuto: true,
			query: NodeApi.isEditor,
		},
		plugins,
		value,
	})

	const serializeDraft = useCallback(
		() =>
			editor.api.markdown.serialize({
				value: stripEditorTitleBlock(editor.children as Value),
			}),
		[editor],
	)

	const captureSnapshot = useCallback(() => {
		const content = serializeDraft()
		const title = getEditorTitleText(editor.children as Value)
		titleState.current = resolveTitleSaveIntent(
			titleState.current,
			title,
			getDocumentById(documentId)?.path,
		)
		return { title: titleState.current.lastRequested, content }
	}, [documentId, editor, getDocumentById, serializeDraft])

	useLayoutEffect(
		() =>
			registerDocumentSnapshotProvider(
				documentId,
				sessionEpoch,
				captureSnapshot,
			),
		[
			captureSnapshot,
			documentId,
			registerDocumentSnapshotProvider,
			sessionEpoch,
		],
	)

	const isSelectionInTitle = useCallback(() => {
		const blockEntry = editor.api.block()
		if (!blockEntry) {
			return false
		}

		const [node, blockPath] = blockEntry
		return (
			blockPath.length === 1 &&
			blockPath[0] === 0 &&
			node.type === NOTE_TITLE_KEY
		)
	}, [editor])

	useEffect(() => {
		if (!active || activeTabId === null) {
			return
		}

		setTabHistorySelectionProvider(activeTabId, () =>
			toTabHistorySelection(editor.selection),
		)

		return () => {
			setTabHistorySelectionProvider(activeTabId, null)
		}
	}, [active, activeTabId, editor, setTabHistorySelectionProvider])

	useEffect(() => {
		const previous = lastActiveRef.current
		lastActiveRef.current = {
			active,
			tabId: activeTabId,
			path,
		}

		if (!active || activeTabId === null || activeHistoryIndex === null) {
			if (previous.active) {
				requestSave()
			}
			return
		}

		const isAliasSwitch =
			previous.active &&
			previous.tabId !== null &&
			previous.tabId !== activeTabId &&
			previous.path === path
		if (isAliasSwitch) {
			lastPathRef.current = path
			return
		}

		const pathDidChange = lastPathRef.current !== path
		lastPathRef.current = path
		const timeoutId = window.setTimeout(() => {
			restoreSelectionOnEditorActivate({
				editor,
				pathDidChange,
				pendingRestore: consumeTabPendingHistorySelectionRestore(
					activeTabId,
					path,
				),
				restoreHistorySelection,
				focusEditorAtDefaultSelection,
			})
		}, 0)

		return () => {
			window.clearTimeout(timeoutId)
		}
	}, [
		active,
		activeHistoryIndex,
		activeTabId,
		consumeTabPendingHistorySelectionRestore,
		editor,
		path,
		requestSave,
	])

	useEffect(() => {
		if (!active) {
			return
		}

		const handleMouseMove = () => {
			resetFocusMode()
		}

		window.addEventListener("mousemove", handleMouseMove)
		return () => {
			window.removeEventListener("mousemove", handleMouseMove)
		}
	}, [active, resetFocusMode])

	useCommandMenuSelectionRestore(editor, active)

	const { isExternalDropOver } = useExternalImageDrop(
		editor,
		workspacePath,
		editorContainerRef,
		active,
	)

	const handleTypingDetection = useCallback(
		(event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey) {
				return
			}
			if (
				event.key.length === 1 ||
				event.key === "Backspace" ||
				event.key === "Enter"
			) {
				onTypingProgress()
			}
		},
		[onTypingProgress],
	)

	const handleEditorMouseDownCapture = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			if (!isSelectionInTitle()) {
				return
			}

			const target = event.target
			if (!(target instanceof HTMLElement)) {
				return
			}

			if (target.closest("[data-note-title-block='true']")) {
				return
			}

			requestSave()
		},
		[isSelectionInTitle, requestSave],
	)

	return (
		<div
			ref={editorContainerRef}
			className={`flex h-full flex-col overflow-hidden ${isExternalDropOver ? "bg-accent/20" : ""}`}
			data-editor-scroll-root
			onMouseDownCapture={handleEditorMouseDownCapture}
		>
			{conflictType && (
				<DocumentConflictNotice
					type={conflictType}
					readDraft={serializeDraft}
					discardDraft={() => discardDocumentChanges(documentId)}
				/>
			)}
			<EditorSurface
				editor={editor}
				containerClassName="min-h-0 flex-1"
				contentClassName={
					isFocusMode
						? "[&_.editor-block-handle]:!opacity-0 [&_.editor-block-handle]:!pointer-events-none"
						: undefined
				}
				onValueChange={() => {
					recordDocumentEdit(documentId, sessionEpoch)
				}}
				onKeyDown={handleTypingDetection}
				onBlur={requestSave}
			/>
		</div>
	)
}
