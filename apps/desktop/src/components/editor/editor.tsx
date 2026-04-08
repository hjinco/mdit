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
	const { tabs, activeTabId, handleTypingProgress } = useStore(
		useShallow((s) => ({
			tabs: s.tabs,
			activeTabId: s.activeTabId,
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

	if (tabs.length === 0 || activeTabId === null) {
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
				{tabs.map((tab) => (
					<EditorPane
						key={tab.id}
						tabId={tab.id}
						active={tab.id === activeTabId}
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
	tabId,
	active,
	destroyOnClose,
	deserializeWithFallback,
	onTypingProgress,
}: {
	tabId: number
	active: boolean
	destroyOnClose?: boolean
	deserializeWithFallback: (input: { content: string; path: string }) => Value
	onTypingProgress: () => void
}) {
	const tab = useStore((s) => s.getTabById(tabId))

	const value = useMemo(() => {
		if (!tab) return
		return deserializeWithFallback({
			content: tab.content,
			path: tab.path,
		})
	}, [deserializeWithFallback, tab])

	if (!tab || !value) {
		return null
	}

	return (
		<div
			className={active ? "block h-full" : "hidden h-full"}
			aria-hidden={!active}
		>
			<EditorContent
				key={`${tab.id}:${tab.sessionEpoch}`}
				tabId={tab.id}
				path={tab.path}
				value={value}
				active={active}
				onTypingProgress={onTypingProgress}
				destroyOnClose={destroyOnClose}
			/>
		</div>
	)
}

function EditorContent({
	tabId,
	path,
	value,
	active,
	onTypingProgress,
	destroyOnClose,
}: {
	tabId: number
	path: string
	value: Value
	active: boolean
	onTypingProgress: () => void
	destroyOnClose?: boolean
}) {
	const isSaved = useRef(true)
	const isInitializing = useRef(true)
	const lastPathRef = useRef(path)
	const {
		setTabSaved,
		saveNoteContent,
		setTabHistorySelectionProvider,
		consumeTabPendingHistorySelectionRestore,
		consumePendingExternalReloadSaveSkip,
	} = useStore(
		useShallow((s) => ({
			setTabSaved: s.setTabSaved,
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
	const plugins = useMemo(() => createEditorKit({ tabId }), [tabId])

	const editor = usePlateEditor({
		chunking: {
			chunkSize: 100,
			contentVisibilityAuto: true,
			query: NodeApi.isEditor,
		},
		plugins,
		value,
	})

	const { handleRenameAfterSave } = useAutoRenameOnSave(tabId, path)

	const handleSave = useCallback(async () => {
		if (isSaved.current) return
		await saveNoteContent(path, editor.api.markdown.serialize())
			.then(async () => {
				isSaved.current = true
				setTabSaved(tabId, true)
				await handleRenameAfterSave()
			})
			.catch(() => {
				isSaved.current = false
				setTabSaved(tabId, false)
				toast.error("Failed to save note")
			})
	}, [editor, path, setTabSaved, handleRenameAfterSave, saveNoteContent, tabId])

	useEffect(() => {
		if (!active) {
			return () => {
				if (!consumePendingExternalReloadSaveSkip(tabId)) {
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
			if (!consumePendingExternalReloadSaveSkip(tabId)) {
				void handleSave()
			}
		}
	}, [
		active,
		consumePendingExternalReloadSaveSkip,
		destroyOnClose,
		handleSave,
		tabId,
	])

	useEffect(() => {
		setTabHistorySelectionProvider(tabId, () =>
			toTabHistorySelection(editor.selection),
		)

		return () => {
			setTabHistorySelectionProvider(tabId, null)
		}
	}, [editor, setTabHistorySelectionProvider, tabId])

	useEffect(() => {
		if (!active) {
			return
		}

		const previousPath = lastPathRef.current
		const pathDidChange = previousPath !== path
		lastPathRef.current = path

		const timeoutId = window.setTimeout(() => {
			const pendingRestore = consumeTabPendingHistorySelectionRestore(
				tabId,
				path,
			)
			if (pendingRestore.found) {
				restoreHistorySelection(editor, pendingRestore.selection)

				return
			}

			// Keep current cursor/selection when only the note path changes
			// (e.g. auto-rename from first heading) without opening a new tab.
			if (pathDidChange) {
				return
			}

			focusEditorAtDefaultSelection(editor)
			editor.tf.focus()
		}, 0)

		return () => {
			window.clearTimeout(timeoutId)
		}
	}, [active, consumeTabPendingHistorySelectionRestore, editor, path, tabId])

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
	useTabSyncedName(tabId, path, value)

	const { isExternalDropOver } = useExternalImageDrop(
		editor,
		workspacePath,
		editorContainerRef,
		active,
	)

	const handleTypingDetection = useCallback(
		(event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey) return
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
					} else {
						isSaved.current = false
						setTabSaved(tabId, false)
					}
				}}
				onKeyDown={handleTypingDetection}
				onBlur={() => {
					void handleSave()
				}}
			/>
		</div>
	)
}
