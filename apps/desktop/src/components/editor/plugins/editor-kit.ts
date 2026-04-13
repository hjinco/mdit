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
	createBlockSelectionKit,
	DndKit,
	FloatingToolbarKit,
} from "@mdit/editor/selection"
import { createSlashKit } from "@mdit/editor/slash"
import { SuggestionKit } from "@mdit/editor/suggestion"
import { TableKit } from "@mdit/editor/table"
import { createTagKit } from "@mdit/editor/tag"
import { createNoteTitleKit } from "@mdit/editor/title"
import { TocKit } from "@mdit/editor/toc"
import { getPortableNoteTitleValidationError } from "@mdit/utils/portable-filename"
import { desktopAIMenuHost } from "../hosts/ai-menu-host"
import { createDesktopBlockSelectionHost } from "../hosts/block-selection-host"
import { desktopFilePasteHost } from "../hosts/file-paste-host"
import { createDesktopFrontmatterHost } from "../hosts/frontmatter-host"
import { createDesktopLinkServices } from "../hosts/link-host"
import { createDesktopMediaHost } from "../hosts/media-host"
import { createDesktopSlashHost } from "../hosts/slash-host"
import { createDesktopTagHost } from "../hosts/tag-host"

type CreateEditorKitOptions = {
	mdx?: boolean
	documentId?: number
	onTitleExit?: () => void
}

export const createEditorKit = ({
	mdx = true,
	documentId,
	onTitleExit,
}: CreateEditorKitOptions = {}) => {
	const desktopTagHost = createDesktopTagHost()
	const desktopLinkServices = createDesktopLinkServices(documentId)
	const desktopFrontmatterHost = createDesktopFrontmatterHost(documentId, {
		linkServices: desktopLinkServices,
		tagHost: desktopTagHost,
	})
	const desktopBlockSelectionHost = createDesktopBlockSelectionHost(documentId)
	const desktopMediaHost = createDesktopMediaHost(documentId)
	const desktopSlashHost = createDesktopSlashHost(documentId)

	return [
		...createAIKit({ host: desktopAIMenuHost }),
		...createFilePasteKit({ host: desktopFilePasteHost }),
		...createNoteTitleKit({
			onExitTitle: onTitleExit,
			titleInputPolicy: {
				getValidationError: getPortableNoteTitleValidationError,
			},
		}),
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
		...createLinkKit({ services: desktopLinkServices }),
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
}

export const EditorKit = createEditorKit({ mdx: true })
export const EditorKitNoMdx = createEditorKit({ mdx: false })
