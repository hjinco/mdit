export const AI_RENAME_SYSTEM_PROMPT = `You are an autonomous markdown note renaming agent.
Use tools to inspect target notes and propose one title per target.
Call set_title with an absolute target path and title without extension.
Do not invent file paths.
After every target is handled, call finish_rename.
Do not stop before finish_rename returns success=true.`
export const MAX_NOTE_CONTEXT_LENGTH = 4000
export const MAX_RENAME_NOTE_AGENT_STEPS = 64
export const MAX_SIBLING_NOTE_NAMES = 8

export const MARKDOWN_EXT_REGEX = /\.md$/i
export const INVALID_FILENAME_CHARS_REGEX = /[<>:"/\\|?*]/g
export const MULTIPLE_WHITESPACE_REGEX = /\s+/g
export const TRAILING_DOTS_REGEX = /\.+$/
