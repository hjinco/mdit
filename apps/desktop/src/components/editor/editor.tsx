import { EditorSurface } from "@mdit/editor/components/editor-surface"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { createSlateEditor, type Value } from "platejs"
import { usePlateEditor } from "platejs/react"
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
import { useLinkedTabName } from "./hooks/use-linked-tab-name"
import { EditorKit } from "./plugins/editor-kit"
import {
	focusEditorAtDefaultSelection,
	restoreHistorySelection,
	toTabHistorySelection,
} from "./utils/history-restore-utils"

export function Editor({ destroyOnClose }: { destroyOnClose?: boolean }) {
	const tab = useStore((s) => s.tab)
	const handleTypingProgress = useStore((s) => s.handleTypingProgress)

	const editor = useMemo(() => {
		return createSlateEditor({
			plugins: EditorKit,
		})
	}, [])

	const value = useMemo(() => {
		if (!tab) return
		return editor.api.markdown.deserialize(tab.content)
	}, [tab, editor])

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
		<div className="relative max-w-full w-full overflow-x-auto flex flex-col bg-background shadow">
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
		workspacePath,
		indexNote,
		setHistorySelectionProvider,
		consumePendingHistorySelectionRestore,
	} = useStore(
		useShallow((s) => ({
			setTabSaved: s.setTabSaved,
			saveNoteContent: s.saveNoteContent,
			workspacePath: s.workspacePath,
			indexNote: s.indexNote,
			setHistorySelectionProvider: s.setHistorySelectionProvider,
			consumePendingHistorySelectionRestore:
				s.consumePendingHistorySelectionRestore,
		})),
	)
	const resetFocusMode = useStore((s) => s.resetFocusMode)

	const editor = usePlateEditor({
		plugins: EditorKit,
		value,
	})

	const { handleRenameAfterSave } = useAutoRenameOnSave(path)

	const runSaveIndexing = useCallback(
		async (notePath: string) => {
			if (!workspacePath) {
				return
			}

			await indexNote(workspacePath, notePath, { includeEmbeddings: false })
		},
		[workspacePath, indexNote],
	)

	const handleSave = useCallback(async () => {
		if (isSaved.current) return
		await saveNoteContent(path, editor.api.markdown.serialize())
			.then(async () => {
				isSaved.current = true
				setTabSaved(true)
				const finalPath = await handleRenameAfterSave()

				try {
					await runSaveIndexing(finalPath)
				} catch (error) {
					console.error("Failed to index note on save:", error)
				}
			})
			.catch(() => {
				isSaved.current = false
				setTabSaved(false)
				toast.error("Failed to save note")
			})
	}, [
		editor,
		path,
		setTabSaved,
		handleRenameAfterSave,
		saveNoteContent,
		runSaveIndexing,
	])

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
		const isInPlacePathChange = previousPath !== path
		lastPathRef.current = path

		const timeoutId = window.setTimeout(() => {
			const pendingRestore = consumePendingHistorySelectionRestore(path)
			if (pendingRestore.found) {
				restoreHistorySelection(editor, pendingRestore.selection)

				return
			}

			// Keep current cursor/selection when only the note path changes
			// (e.g. auto-rename from first heading) without opening a new tab.
			if (isInPlacePathChange) {
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
		<EditorSurface
			editor={editor}
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
	)
}
