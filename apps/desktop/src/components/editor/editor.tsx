import { getCurrentWindow } from "@tauri-apps/api/window"
import { createSlateEditor, type Value } from "platejs"
import {
	Plate,
	PlateContainer,
	PlateContent,
	usePlateEditor,
} from "platejs/react"
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
} from "react"
import { toast } from "sonner"
import { useShallow } from "zustand/shallow"
import { cn } from "@/lib/utils"
import { useStore } from "@/store"
import { isMac } from "@/utils/platform"
import { Header } from "./header/header"
import { useAutoRenameOnSave } from "./hooks/use-auto-rename-on-save"
import { useCommandMenuSelectionRestore } from "./hooks/use-command-menu-selection-restore"
import { useLinkedTabName } from "./hooks/use-linked-tab-name"
import { EditorKit } from "./plugins/editor-kit"
import { SelectionAreaCursor } from "./ui/selection-area-cursor"

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
	const { setTabSaved, saveNoteContent, workspacePath, indexNote } = useStore(
		useShallow((s) => ({
			setTabSaved: s.setTabSaved,
			saveNoteContent: s.saveNoteContent,
			workspacePath: s.workspacePath,
			indexNote: s.indexNote,
		})),
	)
	const resetFocusMode = useStore((s) => s.resetFocusMode)

	const editor = usePlateEditor({
		plugins: EditorKit,
		value,
	})

	const { handleRenameAfterSave } = useAutoRenameOnSave(path)

	const runBlurIndexing = useCallback(
		async (notePath: string) => {
			if (!workspacePath) {
				return
			}

			await indexNote(workspacePath, notePath)
		},
		[workspacePath, indexNote],
	)

	const handleSave = useCallback(
		async (options?: { triggerNoteIndexing?: boolean }) => {
			if (isSaved.current) return
			await saveNoteContent(path, editor.api.markdown.serialize())
				.then(async () => {
					isSaved.current = true
					setTabSaved(true)
					const finalPath = await handleRenameAfterSave()

					if (options?.triggerNoteIndexing) {
						try {
							await runBlurIndexing(finalPath)
						} catch (error) {
							console.error("Failed to index note on blur:", error)
						}
					}
				})
				.catch(() => {
					isSaved.current = false
					setTabSaved(false)
					toast.error("Failed to save note")
				})
		},
		[
			editor,
			path,
			setTabSaved,
			handleRenameAfterSave,
			saveNoteContent,
			runBlurIndexing,
		],
	)

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
		const targetIndex = editor.children.findIndex(
			(element) => element && !editor.api.isVoid(element),
		)

		// Default to index 0 if no non-void element is found.
		const finalIndex = targetIndex === -1 ? 0 : targetIndex

		if (editor.children.length > 0) {
			editor.tf.select([finalIndex], { edge: "start" })
		}
		editor.tf.focus()
	}, [editor])

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
		<Plate
			editor={editor}
			onValueChange={() => {
				if (isInitializing.current) {
					isInitializing.current = false
				} else {
					isSaved.current = false
					setTabSaved(false)
				}
			}}
		>
			<PlateContainer
				className={cn(
					"ignore-click-outside/toolbar",
					"relative w-full h-full overflow-y-auto caret-primary select-text selection:bg-brand/14 focus-visible:outline-none [&_.slate-selection-area]:z-50 [&_.slate-selection-area]:border [&_.slate-selection-area]:border-brand/25 [&_.slate-selection-area]:bg-brand/14",
				)}
				onKeyDown={(e) => {
					handleTypingDetection(e)
				}}
			>
				<PlateContent
					className={cn(
						"group/editor",
						"relative overflow-x-hidden break-words whitespace-pre-wrap select-text",
						"rounded-md ring-offset-background focus-visible:outline-none",
						"placeholder:text-muted-foreground/80 **:data-slate-placeholder:!top-1/2 **:data-slate-placeholder:-translate-y-1/2 **:data-slate-placeholder:text-muted-foreground/80 **:data-slate-placeholder:opacity-100!",
						"[&_strong]:font-bold",
						"size-full px-8 pt-28 pb-72 min-h-screen text-base sm:px-[max(64px,calc(50%-350px))] text-foreground/90 font-scale-scope",
					)}
					placeholder="'/' for commands..."
					autoCapitalize="off"
					autoCorrect="off"
					autoComplete="off"
					spellCheck={false}
					disableDefaultStyles
					onBlur={() => {
						void handleSave({ triggerNoteIndexing: true })
					}}
				/>
			</PlateContainer>
			<SelectionAreaCursor />
		</Plate>
	)
}
