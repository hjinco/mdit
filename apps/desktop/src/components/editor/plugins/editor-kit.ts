import { createAIKit } from "@mdit/editor/ai"
import {
	BasicBlocksKit,
	ListKit,
	ShortcutsKit,
	UtilsKit,
} from "@mdit/editor/basic"
import { CalloutKit } from "@mdit/editor/callout"
import { BasicMarksKit, CodeBlockKit, CodeDrawingKit } from "@mdit/editor/code"
import { DateKit } from "@mdit/editor/date"
import { EmojiKit } from "@mdit/editor/emoji"
import { createFrontmatterKit } from "@mdit/editor/frontmatter"
import { createLinkKit } from "@mdit/editor/link"
import {
	AutoformatKit,
	MarkdownKit,
	MarkdownKitNoMdx,
} from "@mdit/editor/markdown"
import { MathKit } from "@mdit/editor/math"
import { createFilePasteKit, createMediaKit } from "@mdit/editor/media"
import {
	CursorOverlayKit,
	createBlockDraggable,
	createBlockSelectionKit,
	DndPlugin,
	FloatingToolbarKit,
} from "@mdit/editor/selection"
import { createSlashKit } from "@mdit/editor/slash"
import { SuggestionKit } from "@mdit/editor/suggestion"
import { TableKit } from "@mdit/editor/table"
import { createTagKit } from "@mdit/editor/tag"
import { TocKit } from "@mdit/editor/toc"
import type { RenderNodeWrapper } from "platejs/react"
import { useStore } from "@/store"
import { desktopAIMenuHost } from "../hosts/ai-menu-host"
import { createDesktopBlockSelectionHost } from "../hosts/block-selection-host"
import { desktopFilePasteHost } from "../hosts/file-paste-host"
import { createDesktopFrontmatterHost } from "../hosts/frontmatter-host"
import { createDesktopLinkHost } from "../hosts/link-host"
import { desktopMediaHost } from "../hosts/media-host"
import { desktopSlashHost } from "../hosts/slash-host"
import { createDesktopTagHost } from "../hosts/tag-host"
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

const desktopLinkHost = createDesktopLinkHost()
const desktopTagHost = createDesktopTagHost()
const desktopFrontmatterHost = createDesktopFrontmatterHost({
	linkHost: desktopLinkHost,
	tagHost: desktopTagHost,
})
const desktopBlockSelectionHost = createDesktopBlockSelectionHost()

type CreateEditorKitOptions = {
	mdx?: boolean
}

const createEditorKit = ({ mdx = true }: CreateEditorKitOptions = {}) => [
	...createAIKit({ host: desktopAIMenuHost }),
	...createFilePasteKit({ host: desktopFilePasteHost }),
	...TabMetadataKit,
	...AutoformatKit,
	...BasicBlocksKit,
	...BasicMarksKit,
	...createBlockSelectionKit({ host: desktopBlockSelectionHost }),
	...CalloutKit,
	...CodeBlockKit,
	...CodeDrawingKit,
	...CursorOverlayKit,
	...EmojiKit,
	...createFrontmatterKit({ host: desktopFrontmatterHost }),
	...DateKit,
	...DndKit,
	...FloatingToolbarKit,
	...createLinkKit({ host: desktopLinkHost }),
	...ListKit,
	...(mdx ? MarkdownKit : MarkdownKitNoMdx),
	...MathKit,
	...createMediaKit({ host: desktopMediaHost }),
	...ShortcutsKit,
	...createSlashKit({ host: desktopSlashHost }),
	...SuggestionKit,
	...createTagKit({ host: desktopTagHost }),
	...TableKit,
	...TocKit,
	...UtilsKit,
]

export const EditorKit = createEditorKit({ mdx: true })
export const EditorKitNoMdx = createEditorKit({ mdx: false })
