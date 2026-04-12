import { createMarkdownDeserializerWithFallback } from "@mdit/editor/markdown"
import { NodeApi, usePlateEditor, type Value } from "@mdit/editor/plate"
import { EditorSurface } from "@mdit/editor/shared"
import {
	getEditorTitleText,
	injectEditorTitleBlock,
	NOTE_TITLE_KEY,
	normalizeEditorTitleText,
	stripEditorTitleBlock,
} from "@mdit/editor/title"
import { getCurrentWindow } from "@tauri-apps/api/window"
import {
	type KeyboardEvent,
	type MouseEvent,
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
			<div className="relative max-w-full w-full overflow-hidden flex flex-col bg-background shadow">
				<Header hideNavigation={destroyOnClose} />
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

		return injectEditorTitleBlock(
			document.path,
			deserializeWithFallback({
				content: document.content,
				path: document.path,
			}),
		)
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
	type SaveTrigger = "auto" | "blur" | "exit" | "title-exit"

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
	const titleExitHandlerRef = useRef<() => void>(() => {})
	const plugins = useMemo(
		() =>
			createEditorKit({
				documentId,
				onTitleExit: () => {
					titleExitHandlerRef.current()
				},
			}),
		[documentId],
	)

	const editor = usePlateEditor({
		chunking: {
			chunkSize: 100,
			contentVisibilityAuto: true,
			query: NodeApi.isEditor,
		},
		plugins,
		value,
	})

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

	const renameFromTitleIfNeeded = useCallback(async () => {
		const store = useStore.getState()
		const document = store.getDocumentById(documentId)
		if (!document) {
			return path
		}

		const nextTitle = normalizeEditorTitleText(
			getEditorTitleText(editor.children as Value),
		)

		if (!nextTitle || nextTitle === document.name) {
			return document.path
		}

		return store.renameEntry(
			{ path: document.path, name: document.name, isDirectory: false },
			`${nextTitle}.md`,
		)
	}, [documentId, editor, path])

	useEffect(() => {
		isSaved.current = documentIsSaved
	}, [documentIsSaved])

	const handleSave = useCallback(
		async (_trigger: SaveTrigger) => {
			if (isSaved.current) {
				return
			}

			try {
				const nextPath = await renameFromTitleIfNeeded()

				await saveNoteContent(
					nextPath,
					editor.api.markdown.serialize({
						value: stripEditorTitleBlock(editor.children as Value),
					}),
				)

				isSaved.current = true
				setDocumentSaved(documentId, true)
			} catch (_error) {
				isSaved.current = false
				setDocumentSaved(documentId, false)
				toast.error("Failed to save note")
			}
		},
		[
			documentId,
			editor,
			renameFromTitleIfNeeded,
			saveNoteContent,
			setDocumentSaved,
		],
	)

	useEffect(() => {
		titleExitHandlerRef.current = () => {
			void handleSave("title-exit")
		}
	}, [handleSave])

	useEffect(() => {
		if (!active) {
			return () => {
				if (!consumePendingExternalReloadSaveSkip(documentId)) {
					void handleSave("exit")
				}
			}
		}

		const appWindow = getCurrentWindow()
		const interval = setInterval(() => {
			void handleSave("auto")
		}, 10_000)
		const closeListener = appWindow.listen(
			"tauri://close-requested",
			async () => {
				await handleSave("exit")
				if (destroyOnClose) {
					appWindow.destroy()
				}
			},
		)

		return () => {
			closeListener.then((unlisten) => unlisten())
			clearInterval(interval)
			if (!consumePendingExternalReloadSaveSkip(documentId)) {
				void handleSave("exit")
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

			void handleSave("title-exit")
		},
		[handleSave, isSelectionInTitle],
	)

	return (
		<div
			ref={editorContainerRef}
			className={`h-full overflow-hidden ${isExternalDropOver ? "bg-accent/20" : ""}`}
			data-editor-scroll-root
			onMouseDownCapture={handleEditorMouseDownCapture}
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
					void handleSave("blur")
				}}
			/>
		</div>
	)
}
