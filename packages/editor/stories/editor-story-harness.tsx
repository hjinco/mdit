import type { PlateEditor } from "platejs/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { createAIKit } from "../src/ai"
import {
	BasicBlocksKit,
	IndentKit,
	ListKit,
	ShortcutsKit,
	UtilsKit,
} from "../src/basic"
import { CalloutKit } from "../src/callout"
import { BasicMarksKit, CodeBlockKit, CodeDrawingKit } from "../src/code"
import { DateKit } from "../src/date"
import { EmojiKit } from "../src/emoji"
import {
	createDefaultFrontmatterRows,
	createFrontmatterKit,
} from "../src/frontmatter"
import { createLinkKit } from "../src/link"
import { createMarkdownKit, MarkdownKit } from "../src/markdown"
import { MathKit } from "../src/math"
import { createMediaKit } from "../src/media"
import {
	createSlateEditor,
	KEYS,
	NodeApi,
	usePlateEditor,
	type Value,
} from "../src/plate"
import {
	CursorOverlayKit,
	createBlockSelectionKit,
	DndKit,
	FloatingToolbarKit,
} from "../src/selection"
import { EditorSurface } from "../src/shared"
import { createSlashKit } from "../src/slash"
import { SuggestionKit } from "../src/suggestion"
import { TableKit } from "../src/table"
import { createTagKit } from "../src/tag"
import { TocKit } from "../src/toc"

const STORYBOOK_WORKSPACE_ROOT = "/storybook-workspace"
const STORYBOOK_NOTE_PATH = `${STORYBOOK_WORKSPACE_ROOT}/notes/storybook.md`
const STORYBOOK_IMAGE_PATH = `${STORYBOOK_WORKSPACE_ROOT}/assets/trayTemplate.png`

const storyWorkspaceEntries = [
	{
		path: `${STORYBOOK_WORKSPACE_ROOT}/notes`,
		name: "notes",
		isDirectory: true,
		children: [
			{
				path: STORYBOOK_NOTE_PATH,
				name: "storybook.md",
				isDirectory: false,
			},
			{
				path: `${STORYBOOK_WORKSPACE_ROOT}/notes/link-story.md`,
				name: "link-story.md",
				isDirectory: false,
			},
			{
				path: `${STORYBOOK_WORKSPACE_ROOT}/notes/release-notes.md`,
				name: "release-notes.md",
				isDirectory: false,
			},
		],
	},
	{
		path: `${STORYBOOK_WORKSPACE_ROOT}/docs`,
		name: "docs",
		isDirectory: true,
		children: [
			{
				path: `${STORYBOOK_WORKSPACE_ROOT}/docs/editor-guide.md`,
				name: "editor-guide.md",
				isDirectory: false,
			},
		],
	},
]

const storyLinkWorkspaceState = {
	entries: storyWorkspaceEntries,
	tab: { path: STORYBOOK_NOTE_PATH },
	workspacePath: STORYBOOK_WORKSPACE_ROOT,
}

const storyLinkServices = {
	workspace: {
		useSnapshot: () => storyLinkWorkspaceState,
		getSnapshot: () => storyLinkWorkspaceState,
	},
	navigation: {
		openExternal: async () => {},
		openPath: async () => {},
	},
	resolver: {
		resolveWikiLink: async ({ rawTarget }: { rawTarget: string }) => ({
			canonicalTarget: rawTarget,
			disambiguated: false,
			matchCount: 1,
			resolvedRelPath: "docs/editor-guide.md",
			unresolved: false,
		}),
	},
	suggestions: {
		getIndexingConfig: async () => ({
			embeddingModel: "storybook",
			embeddingProvider: "mock",
		}),
		getRelatedNotes: async () => [
			{
				absolutePath: `${STORYBOOK_WORKSPACE_ROOT}/notes/release-notes.md`,
				displayName: "release-notes",
				relativePath: "notes/release-notes.md",
				relativePathLower: "notes/release-notes.md",
			},
		],
	},
	noteCreation: {
		createNote: async () => `${STORYBOOK_WORKSPACE_ROOT}/notes/new-note.md`,
	},
}

const storyPlugins = [
	...createAIKit({
		host: {
			useRuntime: () => ({
				chat: { messages: [], status: "ready" },
				chatConfig: {
					model: "storybook",
					provider: "mock",
				},
				enabledChatModels: [{ model: "storybook", provider: "mock" }],
				selectModel: async () => {},
				isLicenseValid: true,
				canOpenModelSettings: false,
				openModelSettings: () => {},
			}),
			storage: {
				loadCommands: () => [],
				saveCommands: () => {},
				loadHiddenDefaultSelectionCommands: () => [],
				saveHiddenDefaultSelectionCommands: () => {},
			},
		},
	}),
	...BasicBlocksKit,
	...BasicMarksKit,
	...CalloutKit,
	...CodeBlockKit,
	...CodeDrawingKit,
	...createBlockSelectionKit(),
	...createFrontmatterKit(),
	...createLinkKit({
		services: storyLinkServices,
	}),
	...createMarkdownKit(),
	...createMediaKit({
		host: {
			useWorkspaceState: () => ({
				tabPath: STORYBOOK_NOTE_PATH,
				workspacePath: STORYBOOK_WORKSPACE_ROOT,
			}),
			toFileUrl: (absolutePath: string) => `file://${absolutePath}`,
		},
	}),
	...createSlashKit({
		host: {
			getFrontmatterDefaults: async () => createDefaultFrontmatterRows(),
			onResolveImageLinkError: () => {},
			pickImageFile: async () => STORYBOOK_IMAGE_PATH,
			resolveImageLink: async (rawPath) => ({
				url: rawPath,
			}),
		},
	}),
	...createTagKit({
		host: {
			openTagSearch: async () => {},
		},
	}),
	...CursorOverlayKit,
	...DateKit,
	...DndKit,
	...EmojiKit,
	...FloatingToolbarKit,
	...IndentKit,
	...ListKit,
	...MarkdownKit,
	...MathKit,
	...ShortcutsKit,
	...SuggestionKit,
	...TableKit,
	...TocKit,
	...UtilsKit,
]

type StorybookWindow = Window & {
	__editorStorybook?: {
		getMarkdown: () => string
	}
}

export type EditorStoryArgs = {
	description: string
	initialMarkdown: string
	setup?: (editor: PlateEditor) => void
	title: string
}

function deserializeMarkdown(markdown: string): Value {
	return createSlateEditor({ plugins: storyPlugins }).api.markdown.deserialize(
		markdown,
	)
}

export const EditorStoryPaths = {
	image: STORYBOOK_IMAGE_PATH,
	note: STORYBOOK_NOTE_PATH,
	workspace: STORYBOOK_WORKSPACE_ROOT,
}

export const EditorStoryKeys = KEYS

function EditorStoryPane({
	initialMarkdown,
	onMarkdownChange,
	setup,
}: {
	initialMarkdown: string
	onMarkdownChange: (markdown: string) => void
	setup?: (editor: PlateEditor) => void
}) {
	const initialValue = useMemo(
		() => deserializeMarkdown(initialMarkdown),
		[initialMarkdown],
	)
	const didSetupRef = useRef(false)
	const editor = usePlateEditor({
		chunking: {
			chunkSize: 100,
			contentVisibilityAuto: true,
			query: NodeApi.isEditor,
		},
		plugins: storyPlugins,
		value: initialValue,
	})

	useEffect(() => {
		const syncMarkdown = () => {
			onMarkdownChange(editor.api.markdown.serialize())
		}

		if (!didSetupRef.current) {
			setup?.(editor)
			didSetupRef.current = true
		}

		syncMarkdown()
		editor.tf.focus()

		const storybookWindow = window as StorybookWindow
		storybookWindow.__editorStorybook = {
			getMarkdown: () => editor.api.markdown.serialize(),
		}

		return () => {
			delete storybookWindow.__editorStorybook
		}
	}, [editor, onMarkdownChange, setup])

	return (
		<div className="h-full w-full bg-background">
			<EditorSurface
				editor={editor}
				onValueChange={() => {
					onMarkdownChange(editor.api.markdown.serialize())
				}}
			/>
		</div>
	)
}

export function EditorStory({ initialMarkdown, setup }: EditorStoryArgs) {
	const [markdown, setMarkdown] = useState("")

	return (
		<div className="flex h-screen w-full text-foreground">
			<section className="flex flex-1 flex-col border-r border-border">
				<div
					className="flex-1 overflow-auto bg-background"
					data-testid="editor-story"
				>
					<EditorStoryPane
						initialMarkdown={initialMarkdown}
						onMarkdownChange={setMarkdown}
						setup={setup}
					/>
				</div>
			</section>

			<aside className="flex flex-1 flex-col bg-muted/30">
				<header className="flex items-center justify-between border-b border-border px-6 py-4">
					<h2 className="text-sm font-medium text-foreground">
						Markdown Output
					</h2>
				</header>
				<textarea
					readOnly
					value={markdown}
					data-testid="markdown-output"
					className="flex-1 resize-none bg-transparent p-6 font-mono text-sm leading-relaxed outline-none"
				/>
			</aside>
		</div>
	)
}
