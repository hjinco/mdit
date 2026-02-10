import { vi } from "vitest"
import { createStore } from "zustand/vanilla"
import type { StoreState } from "@/store"
import {
	type AiRenameUtils,
	type FrontmatterUtils,
	prepareWorkspaceFsSlice,
	type ToastLike,
} from "../workspace-fs-slice"

type EntryLike = {
	path: string
	name: string
	isDirectory: boolean
	children?: EntryLike[]
}

export const makeFile = (path: string, name: string): EntryLike => ({
	path,
	name,
	isDirectory: false,
	children: undefined,
})

export const makeDir = (
	path: string,
	name: string,
	children: EntryLike[] = [],
): EntryLike => ({
	path,
	name,
	isDirectory: true,
	children,
})

export const collectEntryPaths = (entries: EntryLike[]): string[] => {
	const paths: string[] = []
	const walk = (items: EntryLike[]) => {
		for (const entry of items) {
			paths.push(entry.path)
			if (entry.children) {
				walk(entry.children)
			}
		}
	}
	walk(entries)
	return paths
}

export function createWorkspaceFsTestStore() {
	const fileSystemRepository = {
		exists: vi.fn().mockResolvedValue(false),
		mkdir: vi.fn().mockResolvedValue(undefined),
		readDir: vi.fn().mockResolvedValue([]),
		readTextFile: vi.fn().mockResolvedValue(""),
		rename: vi.fn().mockResolvedValue(undefined),
		writeTextFile: vi.fn().mockResolvedValue(undefined),
		moveToTrash: vi.fn().mockResolvedValue(undefined),
		moveManyToTrash: vi.fn().mockResolvedValue(undefined),
		copy: vi.fn().mockResolvedValue(undefined),
		stat: vi.fn().mockResolvedValue({
			isDirectory: false,
			birthtime: undefined,
			mtime: undefined,
		}),
	}

	const frontmatterUtils: FrontmatterUtils = {
		updateFileFrontmatter: vi.fn().mockResolvedValue(undefined),
		renameFileFrontmatterProperty: vi.fn().mockResolvedValue(undefined),
		removeFileFrontmatterProperty: vi.fn().mockResolvedValue(undefined),
	}

	const toast: ToastLike = {
		success: vi.fn(),
		error: vi.fn(),
	}

	const aiRenameUtils: AiRenameUtils = {
		AI_RENAME_SYSTEM_PROMPT: "rename-system-prompt",
		buildRenamePrompt: vi.fn().mockReturnValue("prompt"),
		collectSiblingNoteNames: vi.fn().mockReturnValue([]),
		createModelFromConfig: vi.fn().mockReturnValue({}),
		extractAndSanitizeName: vi.fn().mockReturnValue("renamed-note"),
	}

	const createSlice = prepareWorkspaceFsSlice({
		fileSystemRepository,
		generateText: vi.fn().mockResolvedValue({ text: "renamed-note" }),
		frontmatterUtils,
		toast,
		aiRenameUtils,
	})

	// @ts-expect-error - todo
	const store = createStore<StoreState>()((set, get, api) => {
		const slice = createSlice(set, get, api)
		const updateEntries = vi.fn((entriesOrAction) => {
			const nextEntries =
				typeof entriesOrAction === "function"
					? entriesOrAction(get().entries ?? [])
					: entriesOrAction
			set({ entries: nextEntries })
		})

		return {
			...slice,
			workspacePath: "/ws",
			entries: [],
			updateEntries,
			entryCreated: vi.fn(),
			entriesDeleted: vi.fn(),
			entryRenamed: vi.fn(),
			entryMoved: vi.fn(),
			entryImported: vi.fn(),
			openTab: vi.fn(),
			closeTab: vi.fn(),
			renameTab: vi.fn(),
			removePathFromHistory: vi.fn(),
			updateHistoryPath: vi.fn(),
			setCurrentCollectionPath: vi.fn(),
			clearLastCollectionPath: vi.fn(),
			setSelectedEntryPaths: vi.fn(),
			setSelectionAnchorPath: vi.fn(),
			refreshCollectionEntries: vi.fn(),
		}
	})

	return {
		store,
		fileSystemRepository,
		frontmatterUtils,
		toast,
		aiRenameUtils,
	}
}
