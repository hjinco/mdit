import { AIKit } from './ai-kit'
import { AutoformatKit } from './autoformat-kit'
import { BasicBlocksKit } from './basic-blocks-kit'
import { BasicMarksKit } from './basic-marks-kit'
import { BlockSelectionKit } from './block-selection-kit'
import { CalloutKit } from './callout-kit'
import { CodeBlockKit } from './code-block-kit'
import { CommentKit } from './comment-kit'
import { CursorOverlayKit } from './cursor-overlay-kit'
import { DateKit } from './date-kit'
import { DropKit } from './drop-kit'
import { EmojiKit } from './emoji-kit'
import { FilePasteKit } from './file-paste-kit'
import { FloatingToolbarKit } from './floating-toolbar-kit'
import { FrontmatterKit } from './frontmatter-kit'
import { LinkKit } from './link-kit'
import { ListKit } from './list-kit'
import { MarkdownKit } from './markdown-kit'
import { MathKit } from './math-kit'
import { MediaKit } from './media-kit'
import { ShortcutsKit } from './shortcuts-kit'
import { SlashKit } from './slash-kit'
import { SuggestionKit } from './suggestion-kit'
import { TableKit } from './table-kit'
import { TocKit } from './toc-kit'
import { UtilsKit } from './utils-kit'

export const EditorKit = [
  ...FilePasteKit,
  ...AIKit,
  ...AutoformatKit,
  ...BasicBlocksKit,
  ...BasicMarksKit,
  ...BlockSelectionKit,
  ...CalloutKit,
  ...CodeBlockKit,
  // ...ColumnKit,
  ...CommentKit,
  ...CursorOverlayKit,
  ...EmojiKit,
  ...FrontmatterKit,
  ...DateKit,
  ...DropKit,
  ...FloatingToolbarKit,
  ...LinkKit,
  ...ListKit,
  ...MarkdownKit,
  ...MathKit,
  ...MediaKit,
  ...ShortcutsKit,
  ...SlashKit,
  ...SuggestionKit,
  ...TableKit,
  ...TocKit,
  ...UtilsKit,
]
