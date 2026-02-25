export const AI_RENAME_SYSTEM_PROMPT = `You are an assistant that suggests concise, unique titles for markdown notes.
Return only the new title without a file extension.
Keep it under 60 characters and avoid special characters like / \\ : * ? " < > |.`
export const MAX_NOTE_CONTEXT_LENGTH = 4000

export const MARKDOWN_EXT_REGEX = /\.md$/i
export const INVALID_FILENAME_CHARS_REGEX = /[<>:"/\\|?*]/g
export const MULTIPLE_WHITESPACE_REGEX = /\s+/g
export const TRAILING_DOTS_REGEX = /\.+$/
