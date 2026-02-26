import { beforeEach, describe, expect, it, vi } from "vitest"

const hoisted = vi.hoisted(() => {
	const stateRef: { current: Record<string, unknown> } = { current: {} }
	const useStore = Object.assign(
		(selector: (state: Record<string, unknown>) => unknown) =>
			selector(stateRef.current),
		{
			getState: () => stateRef.current,
		},
	)

	return {
		stateRef,
		useStore,
		organizeNotes: vi.fn(),
		lockAiEntries: vi.fn(),
		unlockAiEntries: vi.fn(),
		refreshCodexOAuthForTarget: vi.fn(),
		moveEntry: vi.fn(),
		toastCustom: vi.fn(),
		toastError: vi.fn(),
		toastDismiss: vi.fn(),
	}
})

type StoreEntry = {
	path: string
	name: string
	isDirectory: boolean
	children?: StoreEntry[]
}

type StoreState = {
	chatConfig: {
		provider: "openai"
		model: string
		apiKey: string
	}
	workspacePath: string
	entries: StoreEntry[]
	lockAiEntries: (paths: string[]) => void
	unlockAiEntries: (paths: string[]) => void
	refreshCodexOAuthForTarget: () => Promise<void>
	moveEntry: (
		sourcePath: string,
		destinationPath: string,
		options?: {
			onConflict?: "fail" | "auto-rename"
			allowLockedSourcePath?: boolean
			onMoved?: (newPath: string) => void
		},
	) => Promise<boolean>
}

vi.mock("react", async () => {
	const actual = await vi.importActual<typeof import("react")>("react")
	return {
		...actual,
		useCallback: <T extends (...args: unknown[]) => unknown>(callback: T) =>
			callback,
	}
})

vi.mock("@mdit/ai", () => ({
	CODEX_BASE_URL: "https://codex.invalid",
	createMoveNoteWithAICore: () => ({
		organizeNotes: hoisted.organizeNotes,
	}),
	isMarkdownPath: (path: string) => path.endsWith(".md"),
}))

vi.mock("@tauri-apps/plugin-fs", () => ({
	readTextFile: vi.fn(),
}))

vi.mock("@tauri-apps/plugin-http", () => ({
	fetch: vi.fn(),
}))

vi.mock("sonner", () => ({
	toast: {
		custom: hoisted.toastCustom,
		error: hoisted.toastError,
		dismiss: hoisted.toastDismiss,
	},
}))

vi.mock("@/store", () => ({
	useStore: hoisted.useStore,
}))

import { useMoveNotesWithAI } from "./use-move-notes-with-ai"

type MoveToastItem = {
	sourcePath: string
	destinationDirPath: string
	newPath: string
}

type MoveToastElement = {
	props: {
		items: MoveToastItem[]
		onUndo: (item: MoveToastItem) => Promise<boolean>
		onConfirm: () => void
	}
}

describe("useMoveNotesWithAI", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		hoisted.refreshCodexOAuthForTarget.mockResolvedValue(undefined)
		hoisted.moveEntry.mockResolvedValue(true)

		hoisted.stateRef.current = {
			chatConfig: {
				provider: "openai",
				model: "gpt-4.1-mini",
				apiKey: "test-key",
			},
			workspacePath: "/ws",
			entries: [
				{
					path: "/ws/inbox",
					name: "inbox",
					isDirectory: true,
					children: [
						{
							path: "/ws/inbox/todo.md",
							name: "todo.md",
							isDirectory: false,
						},
					],
				},
				{
					path: "/ws/projects",
					name: "projects",
					isDirectory: true,
					children: [],
				},
			],
			lockAiEntries: hoisted.lockAiEntries,
			unlockAiEntries: hoisted.unlockAiEntries,
			refreshCodexOAuthForTarget: hoisted.refreshCodexOAuthForTarget,
			moveEntry: hoisted.moveEntry,
		} satisfies StoreState
	})

	it("shows persistent move results toast and undo moves a note back", async () => {
		hoisted.organizeNotes.mockResolvedValue({
			movedCount: 1,
			unchangedCount: 0,
			failedCount: 0,
			operations: [
				{
					path: "/ws/inbox/todo.md",
					status: "moved",
					destinationDirPath: "/ws/projects",
					newPath: "/ws/projects/todo (1).md",
				},
			],
		})

		const { moveNotesWithAI } = useMoveNotesWithAI()

		await moveNotesWithAI([
			{
				path: "/ws/inbox/todo.md",
				name: "todo.md",
				isDirectory: false,
			},
		])

		expect(hoisted.toastCustom).toHaveBeenCalledTimes(1)
		expect(hoisted.toastCustom).toHaveBeenCalledWith(expect.any(Function), {
			position: "bottom-left",
			duration: Number.POSITIVE_INFINITY,
			closeButton: false,
		})

		const renderToast = hoisted.toastCustom.mock
			.calls[0][0] as () => MoveToastElement
		const toastElement = renderToast()
		expect(toastElement.props.items).toEqual([
			{
				sourcePath: "/ws/inbox/todo.md",
				destinationDirPath: "/ws/projects",
				newPath: "/ws/projects/todo (1).md",
			},
		])

		const didUndo = await toastElement.props.onUndo(toastElement.props.items[0])

		expect(didUndo).toBe(true)
		expect(hoisted.moveEntry).toHaveBeenLastCalledWith(
			"/ws/projects/todo (1).md",
			"/ws/inbox",
			{
				onConflict: "fail",
			},
		)
		expect(hoisted.lockAiEntries).toHaveBeenCalledWith(["/ws/inbox/todo.md"])
		expect(hoisted.unlockAiEntries).toHaveBeenCalledWith(["/ws/inbox/todo.md"])
		expect(hoisted.toastError).not.toHaveBeenCalled()
	})

	it("uses fallback newPath and shows summary error when failed entries exist", async () => {
		hoisted.organizeNotes.mockResolvedValue({
			movedCount: 1,
			unchangedCount: 0,
			failedCount: 1,
			operations: [
				{
					path: "/ws/inbox/todo.md",
					status: "moved",
					destinationDirPath: "/ws/projects",
				},
				{
					path: "/ws/inbox/fail.md",
					status: "failed",
					destinationDirPath: "/ws/projects",
					reason: "moveEntry returned false",
				},
			],
		})

		const { moveNotesWithAI } = useMoveNotesWithAI()

		await moveNotesWithAI([
			{
				path: "/ws/inbox/todo.md",
				name: "todo.md",
				isDirectory: false,
			},
			{
				path: "/ws/inbox/fail.md",
				name: "fail.md",
				isDirectory: false,
			},
		])

		const renderToast = hoisted.toastCustom.mock
			.calls[0][0] as () => MoveToastElement
		const toastElement = renderToast()
		expect(toastElement.props.items).toEqual([
			{
				sourcePath: "/ws/inbox/todo.md",
				destinationDirPath: "/ws/projects",
				newPath: "/ws/projects/todo.md",
			},
		])
		expect(hoisted.toastError).toHaveBeenCalledWith(
			"AI folder move complete: moved 1, unchanged 0, failed 1.",
			{ position: "bottom-left" },
		)
	})

	it("undo handler resolves false when moveEntry throws", async () => {
		hoisted.organizeNotes.mockResolvedValue({
			movedCount: 1,
			unchangedCount: 0,
			failedCount: 0,
			operations: [
				{
					path: "/ws/inbox/todo.md",
					status: "moved",
					destinationDirPath: "/ws/projects",
					newPath: "/ws/projects/todo (1).md",
				},
			],
		})
		hoisted.moveEntry.mockRejectedValueOnce(new Error("undo failed"))

		const { moveNotesWithAI } = useMoveNotesWithAI()

		await moveNotesWithAI([
			{
				path: "/ws/inbox/todo.md",
				name: "todo.md",
				isDirectory: false,
			},
		])

		const renderToast = hoisted.toastCustom.mock
			.calls[0][0] as () => MoveToastElement
		const toastElement = renderToast()
		const didUndo = await toastElement.props.onUndo(toastElement.props.items[0])

		expect(didUndo).toBe(false)
		expect(hoisted.toastError).toHaveBeenCalledWith(
			'Failed to undo AI move for "todo.md".',
			{ position: "bottom-left" },
		)
	})
})
