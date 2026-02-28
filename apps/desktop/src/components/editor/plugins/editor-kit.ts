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
import { createFilePasteKit } from "@mdit/editor/plugins/file-paste-kit"
import { FloatingToolbarKit } from "@mdit/editor/plugins/floating-toolbar-kit"
import { FrontmatterKit } from "@mdit/editor/plugins/frontmatter-kit"
import type { LinkWorkspaceState } from "@mdit/editor/plugins/link-kit"
import { createLinkKit } from "@mdit/editor/plugins/link-kit"
import { ListKit } from "@mdit/editor/plugins/list-kit"
import { MarkdownKit } from "@mdit/editor/plugins/markdown-kit"
import { MathKit } from "@mdit/editor/plugins/math-kit"
import { createMediaKit } from "@mdit/editor/plugins/media-kit"
import { ShortcutsKit } from "@mdit/editor/plugins/shortcuts-kit"
import { createSlashKit } from "@mdit/editor/plugins/slash-kit"
import { SuggestionKit } from "@mdit/editor/plugins/suggestion-kit"
import { TableKit } from "@mdit/editor/plugins/table-kit"
import { TocKit } from "@mdit/editor/plugins/toc-kit"
import { UtilsKit } from "@mdit/editor/plugins/utils-kit"
import type { RenderNodeWrapper } from "platejs/react"
import { useShallow } from "zustand/shallow"
import { useStore } from "@/store"
import { createDesktopBlockSelectionHost } from "../hosts/block-selection-host"
import { desktopFilePasteHost } from "../hosts/file-paste-host"
import { createDesktopLinkHost } from "../hosts/link-host"
import { desktopMediaHost } from "../hosts/media-host"
import { desktopSlashHost } from "../hosts/slash-host"
import { AIMenu } from "../ui/ai-menu"
import { DatabaseElement } from "../ui/node-database"
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

const useLinkWorkspaceState = () =>
	useStore(
		useShallow(
			(state): LinkWorkspaceState => ({
				workspacePath: state.workspacePath,
				tab: state.tab,
				entries: state.entries,
			}),
		),
	)

const getLinkWorkspaceState = (): LinkWorkspaceState => {
	const state = useStore.getState()
	return {
		workspacePath: state.workspacePath,
		tab: state.tab,
		entries: state.entries,
	}
}

export const EditorKit = [
	...createAIKit({ AIMenu }),
	...createFilePasteKit({ host: desktopFilePasteHost }),
	...TabMetadataKit,
	...AutoformatKit,
	...BasicBlocksKit,
	...BasicMarksKit,
	...createBlockSelectionKit({
		onCreateLinkedNotesFromListItems:
			createDesktopBlockSelectionHost().createLinkedNotesFromListItems,
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
		host: createDesktopLinkHost(),
		useWorkspaceState: useLinkWorkspaceState,
		getWorkspaceState: getLinkWorkspaceState,
	}),
	...ListKit,
	...MarkdownKit,
	...MathKit,
	...createMediaKit({ host: desktopMediaHost }),
	...ShortcutsKit,
	...createSlashKit({ host: desktopSlashHost }),
	...SuggestionKit,
	...TableKit,
	...TocKit,
	...UtilsKit,
]
