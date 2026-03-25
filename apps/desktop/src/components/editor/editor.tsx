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
import { useLinkedTabName } from "./hooks/use-linked-tab-name"
import { EditorKit, EditorKitNoMdx } from "./plugins/editor-kit"
import {
	focusEditorAtDefaultSelection,
	restoreHistorySelection,
	toTabHistorySelection,
} from "./utils/history-restore-utils"

export function Editor({ destroyOnClose }: { destroyOnClose?: boolean }) {
	const tab = useStore((s) => s.tab)
	const handleTypingProgress = useStore((s) => s.handleTypingProgress)

	const deserializeWithFallback = useMemo(
		() =>
			createMarkdownDeserializerWithFallback({
				mdxPlugins: EditorKit,
				noMdxPlugins: EditorKitNoMdx,
			}),
		[],
	)

	const value = useMemo(() => {
		if (!tab) return
		return deserializeWithFallback({
			content: tab.content,
			path: tab.path,
		})
	}, [tab, deserializeWithFallback])

	if (!tab || !value)
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

	return (
		<div className="relative max-w-full w-full overflow-hidden flex flex-col bg-background shadow">
			<Header />
			<EditorContent
				key={tab.id}
				path={tab.path}
				value={value}
				onTypingProgress={handleTypingProgress}
				destroyOnClose={destroyOnClose}
			/>
		</div>
	)
}

function EditorContent({
	path,
	value,
	onTypingProgress,
	destroyOnClose,
}: {
	path: string
	value: Value
	onTypingProgress: () => void
	destroyOnClose?: boolean
}) {
	const isSaved = useRef(true)
	const isInitializing = useRef(true)
	const lastPathRef = useRef(path)
	const {
		setTabSaved,
		saveNoteContent,
		setHistorySelectionProvider,
		consumePendingHistorySelectionRestore,
	} = useStore(
		useShallow((s) => ({
			setTabSaved: s.setTabSaved,
			saveNoteContent: s.saveNoteContent,
			setHistorySelectionProvider: s.setHistorySelectionProvider,
			consumePendingHistorySelectionRestore:
				s.consumePendingHistorySelectionRestore,
		})),
	)
	const resetFocusMode = useStore((s) => s.resetFocusMode)
	const isFocusMode = useStore((s) => s.isFocusMode)
	const workspacePath = useStore((s) => s.workspacePath)
	const editorContainerRef = useRef<HTMLDivElement | null>(null)

	const editor = usePlateEditor({
		chunking: {
			chunkSize: 100,
			contentVisibilityAuto: true,
			query: NodeApi.isEditor,
		},
		plugins: EditorKit,
		value,
	})

	const { handleRenameAfterSave } = useAutoRenameOnSave(path)

	const handleSave = useCallback(async () => {
		if (isSaved.current) return
		await saveNoteContent(path, editor.api.markdown.serialize())
			.then(async () => {
				isSaved.current = true
				setTabSaved(true)
				await handleRenameAfterSave()
			})
			.catch(() => {
				isSaved.current = false
				setTabSaved(false)
				toast.error("Failed to save note")
			})
	}, [editor, path, setTabSaved, handleRenameAfterSave, saveNoteContent])

	useEffect(() => {
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
			handleSave()
		}
	}, [handleSave, destroyOnClose])

	useEffect(() => {
		setHistorySelectionProvider(() => toTabHistorySelection(editor.selection))

		return () => {
			setHistorySelectionProvider(null)
		}
	}, [editor, setHistorySelectionProvider])

	useEffect(() => {
		const previousPath = lastPathRef.current
		const pathDidChange = previousPath !== path
		lastPathRef.current = path

		const timeoutId = window.setTimeout(() => {
			const pendingRestore = consumePendingHistorySelectionRestore(path)
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
	}, [consumePendingHistorySelectionRestore, editor, path])

	useEffect(() => {
		const handleMouseMove = () => {
			resetFocusMode()
		}
		window.addEventListener("mousemove", handleMouseMove)
		return () => {
			window.removeEventListener("mousemove", handleMouseMove)
		}
	}, [resetFocusMode])

	useCommandMenuSelectionRestore(editor)
	useLinkedTabName(path, value)

	const { isExternalDropOver } = useExternalImageDrop(
		editor,
		workspacePath,
		editorContainerRef,
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
			className={`overflow-hidden ${isExternalDropOver ? "bg-accent/20" : ""}`}
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
						setTabSaved(false)
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
