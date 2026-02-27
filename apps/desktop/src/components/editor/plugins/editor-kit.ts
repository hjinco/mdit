import { createAIKit } from "@mdit/editor/plugins/ai-kit"
import { AutoformatKit } from "@mdit/editor/plugins/autoformat-kit"
import { BasicBlocksKit } from "@mdit/editor/plugins/basic-blocks-kit"
import { BasicMarksKit } from "@mdit/editor/plugins/basic-marks-kit"
import { createBlockSelectionKit } from "@mdit/editor/plugins/block-selection-kit"
import { CalloutKit } from "@mdit/editor/plugins/callout-kit"
import { CodeBlockKit } from "@mdit/editor/plugins/code-block-kit"
import { CodeDrawingKit } from "@mdit/editor/plugins/code-drawing-kit"
import { CursorOverlayKit } from "@mdit/editor/plugins/cursor-overlay-kit"
import { createDatabaseKit } from "@mdit/editor/plugins/database-kit"
import { DateKit } from "@mdit/editor/plugins/date-kit"
import { createBlockDraggable, DndPlugin } from "@mdit/editor/plugins/dnd-kit"
import { EmojiKit } from "@mdit/editor/plugins/emoji-kit"
import { FloatingToolbarKit } from "@mdit/editor/plugins/floating-toolbar-kit"
import { FrontmatterKit } from "@mdit/editor/plugins/frontmatter-kit"
import { createLinkKit } from "@mdit/editor/plugins/link-kit"
import { ListKit } from "@mdit/editor/plugins/list-kit"
import { MathKit } from "@mdit/editor/plugins/math-kit"
import { createMediaKit } from "@mdit/editor/plugins/media-kit"
import { ShortcutsKit } from "@mdit/editor/plugins/shortcuts-kit"
import { createSlashKit } from "@mdit/editor/plugins/slash-kit"
import { SuggestionKit } from "@mdit/editor/plugins/suggestion-kit"
import { TableKit } from "@mdit/editor/plugins/table-kit"
import { TocKit } from "@mdit/editor/plugins/toc-kit"
import { UtilsKit } from "@mdit/editor/plugins/utils-kit"
import type { RenderNodeWrapper } from "platejs/react"
import { useStore } from "@/store"
import { AIMenu } from "../ui/ai-menu"
import {
	LinkFloatingToolbar,
	linkLeafDefaultAttributes,
} from "../ui/link-toolbar"
import { DatabaseElement } from "../ui/node-database"
import { ImageElement } from "../ui/node-media-image"
import { SlashInputElement } from "../ui/node-slash"
import { createLinkedNotesFromListItems } from "./block-selection-note-linking"
import { FilePasteKit } from "./file-paste-kit"
import { MarkdownKit } from "./markdown-kit"
import { TabMetadataKit } from "./tab-metadata-kit"

const AppBlockDraggable: RenderNodeWrapper = (props) => {
	const isFocusMode = useStore((s) => s.isFocusMode)
	return createBlockDraggable(isFocusMode)(props)
}

const DndKit = [
	DndPlugin.configure({
		render: {
			aboveNodes: AppBlockDraggable,
		},
	}),
]

const handleCreateLinkedNotesFromListItems = async (items: string[]) => {
	const { workspacePath, tab, createNote } = useStore.getState()
	if (!workspacePath) {
		return items.map(() => null)
	}

	return createLinkedNotesFromListItems({
		items,
		workspacePath,
		currentTabPath: tab?.path ?? null,
		createNote,
	})
}

export const EditorKit = [
	...createAIKit({ AIMenu }),
	...FilePasteKit,
	...TabMetadataKit,
	...AutoformatKit,
	...BasicBlocksKit,
	...BasicMarksKit,
	...createBlockSelectionKit({
		onCreateLinkedNotesFromListItems: handleCreateLinkedNotesFromListItems,
	}),
	...CalloutKit,
	...CodeBlockKit,
	...CodeDrawingKit,
	...createDatabaseKit({ DatabaseElement }),
	...CursorOverlayKit,
	...EmojiKit,
	...FrontmatterKit,
	...DateKit,
	...DndKit,
	...FloatingToolbarKit,
	...createLinkKit({
		LinkFloatingToolbar,
		defaultLinkAttributes: linkLeafDefaultAttributes,
	}),
	...ListKit,
	...MarkdownKit,
	...MathKit,
	...createMediaKit({ ImageElement }),
	...ShortcutsKit,
	...createSlashKit({ SlashInputElement }),
	...SuggestionKit,
	...TableKit,
	...TocKit,
	...UtilsKit,
]
