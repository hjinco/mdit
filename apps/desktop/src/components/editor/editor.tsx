import { createMarkdownDeserializerWithFallback } from "@mdit/editor/markdown"
import { NodeApi, usePlateEditor, type Value } from "@mdit/editor/plate"
import { EditorSurface } from "@mdit/editor/shared"
import { getCurrentWindow } from "@tauri-apps/api/window"
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from "react"
import { toast } from "sonner"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"
import { isMac } from "@/utils/platform"
import { Header } from "./header/header"
import { useAutoRenameOnSave } from "./hooks/use-auto-rename-on-save"
import { useCommandMenuSelectionRestore } from "./hooks/use-command-menu-selection-restore"
import { useExternalImageDrop } from "./hooks/use-external-image-drop"
import { useTabSyncedName } from "./hooks/use-tab-synced-name"
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

export function Editor({ destroyOnClose }: { destroyOnClose?: boolean }) {
	const {
		openDocuments,
		activeDocumentId,
		activeTabId,
		tabCount,
		handleTypingProgress,
	} = useStore(
		useShallow((s) => ({
			openDocuments: s.openDocuments,
			activeDocumentId: s.getActiveDocumentId(),
			activeTabId: s.activeTabId,
			tabCount: s.tabs.length,
			handleTypingProgress: s.handleTypingProgress,
		})),
	)

	const deserializeWithFallback = useMemo(
		() =>
			createMarkdownDeserializerWithFallback({
				mdxPlugins: EditorKit,
				noMdxPlugins: EditorKitNoMdx,
			}),
		[],
	)

	if (tabCount === 0 || activeDocumentId === null || activeTabId === null) {
		return (
			<div className="flex-1 h-full">
				<div className="h-full bg-background shadow">
					<div
						className="h-12 w-full"
						{...(isMac() && { "data-tauri-drag-region": "" })}
					/>
				</div>
			</div>
		)
	}

	return (
		<div className="relative max-w-full w-full overflow-hidden flex flex-col bg-background shadow">
			<Header hideNavigation={destroyOnClose} />
			<div className="relative min-h-0 flex-1">
				{openDocuments.map((document) => (
					<EditorPane
						key={document.id}
						documentId={document.id}
						active={document.id === activeDocumentId}
						activeTabId={document.id === activeDocumentId ? activeTabId : null}
						destroyOnClose={destroyOnClose}
						deserializeWithFallback={deserializeWithFallback}
						onTypingProgress={handleTypingProgress}
					/>
				))}
			</div>
		</div>
	)
}

function EditorPane({
	documentId,
	active,
	activeTabId,
	destroyOnClose,
	deserializeWithFallback,
	onTypingProgress,
}: {
	documentId: number
	active: boolean
	activeTabId: number | null
	destroyOnClose?: boolean
	deserializeWithFallback: (input: { content: string; path: string }) => Value
	onTypingProgress: () => void
}) {
	const document = useStore((s) => s.getDocumentById(documentId))

	const value = useMemo(() => {
		if (!document) {
			return
		}

		return deserializeWithFallback({
			content: document.content,
			path: document.path,
		})
	}, [deserializeWithFallback, document])

	if (!document || !value) {
		return null
	}

	return (
		<div
			className={active ? "block h-full" : "hidden h-full"}
			aria-hidden={!active}
		>
			<EditorContent
				key={`${document.id}:${document.sessionEpoch}`}
				documentId={document.id}
				activeTabId={activeTabId}
				path={document.path}
				value={value}
				active={active}
				documentIsSaved={document.isSaved}
				onTypingProgress={onTypingProgress}
				destroyOnClose={destroyOnClose}
			/>
		</div>
	)
}

function EditorContent({
	documentId,
	activeTabId,
	path,
	value,
	active,
	documentIsSaved,
	onTypingProgress,
	destroyOnClose,
}: {
	documentId: number
	activeTabId: number | null
	path: string
	value: Value
	active: boolean
	documentIsSaved: boolean
	onTypingProgress: () => void
	destroyOnClose?: boolean
}) {
	const isSaved = useRef(documentIsSaved)
	const isInitializing = useRef(true)
	const lastPathRef = useRef(path)
	const lastActiveRef = useRef({
		active,
		tabId: activeTabId,
		path,
	})
	const {
		setDocumentSaved,
		saveNoteContent,
		setTabHistorySelectionProvider,
		consumeTabPendingHistorySelectionRestore,
		consumePendingExternalReloadSaveSkip,
	} = useStore(
		useShallow((s) => ({
			setDocumentSaved: s.setDocumentSaved,
			saveNoteContent: s.saveNoteContent,
			setTabHistorySelectionProvider: s.setTabHistorySelectionProvider,
			consumeTabPendingHistorySelectionRestore:
				s.consumeTabPendingHistorySelectionRestore,
			consumePendingExternalReloadSaveSkip:
				s.consumePendingExternalReloadSaveSkip,
		})),
	)
	const resetFocusMode = useStore((s) => s.resetFocusMode)
	const isFocusMode = useStore((s) => s.isFocusMode)
	const workspacePath = useStore((s) => s.workspacePath)
	const editorContainerRef = useRef<HTMLDivElement | null>(null)
	const plugins = useMemo(() => createEditorKit({ documentId }), [documentId])

	const editor = usePlateEditor({
		chunking: {
			chunkSize: 100,
			contentVisibilityAuto: true,
			query: NodeApi.isEditor,
		},
		plugins,
		value,
	})

	const { handleRenameAfterSave } = useAutoRenameOnSave(documentId, path)

	useEffect(() => {
		isSaved.current = documentIsSaved
	}, [documentIsSaved])

	const handleSave = useCallback(async () => {
		if (isSaved.current) {
			return
		}

		await saveNoteContent(path, editor.api.markdown.serialize())
			.then(async () => {
				isSaved.current = true
				setDocumentSaved(documentId, true)
				await handleRenameAfterSave()
			})
			.catch(() => {
				isSaved.current = false
				setDocumentSaved(documentId, false)
				toast.error("Failed to save note")
			})
	}, [
		documentId,
		editor,
		handleRenameAfterSave,
		path,
		saveNoteContent,
		setDocumentSaved,
	])

	useEffect(() => {
		if (!active) {
			return () => {
				if (!consumePendingExternalReloadSaveSkip(documentId)) {
					void handleSave()
				}
			}
		}

		const appWindow = getCurrentWindow()
		const interval = setInterval(handleSave, 10_000)
		const closeListener = appWindow.listen(
			"tauri://close-requested",
			async () => {
				await handleSave()
				if (destroyOnClose) {
					appWindow.destroy()
				}
			},
		)

		return () => {
			closeListener.then((unlisten) => unlisten())
			clearInterval(interval)
			if (!consumePendingExternalReloadSaveSkip(documentId)) {
				void handleSave()
			}
		}
	}, [
		active,
		consumePendingExternalReloadSaveSkip,
		destroyOnClose,
		documentId,
		handleSave,
	])

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

		if (!active || activeTabId === null) {
			return
		}

		const pathDidChange = lastPathRef.current !== path
		lastPathRef.current = path
		const isAliasSwitch =
			previous.active &&
			previous.tabId !== null &&
			previous.tabId !== activeTabId &&
			previous.path === path
		if (isAliasSwitch) {
			return
		}

		const timeoutId = window.setTimeout(() => {
			const pendingRestore = consumeTabPendingHistorySelectionRestore(
				activeTabId,
				path,
			)
			if (pendingRestore.found) {
				restoreHistorySelection(editor, pendingRestore.selection)
				return
			}

			// Keep the current selection when only the backing file path changes.
			if (pathDidChange) {
				return
			}

			focusEditorAtDefaultSelection(editor)
			editor.tf.focus()
		}, 0)

		return () => {
			window.clearTimeout(timeoutId)
		}
	}, [
		active,
		activeTabId,
		consumeTabPendingHistorySelectionRestore,
		editor,
		path,
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
	useTabSyncedName(documentId, path, value)

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

	return (
		<div
			ref={editorContainerRef}
			className={`h-full overflow-hidden ${isExternalDropOver ? "bg-accent/20" : ""}`}
			data-editor-scroll-root
		>
			<EditorSurface
				editor={editor}
				contentClassName={
					isFocusMode
						? "[&_.editor-block-handle]:!opacity-0 [&_.editor-block-handle]:!pointer-events-none"
						: undefined
				}
				onValueChange={() => {
					if (isInitializing.current) {
						isInitializing.current = false
						return
					}

					isSaved.current = false
					setDocumentSaved(documentId, false)
				}}
				onKeyDown={handleTypingDetection}
				onBlur={() => {
					void handleSave()
				}}
			/>
		</div>
	)
}
