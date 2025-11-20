import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { join } from '@tauri-apps/api/path'
import { exists, readDir } from '@tauri-apps/plugin-fs'
import { ollama } from 'ollama-ai-provider-v2'

export const AI_RENAME_SYSTEM_PROMPT = `You are an assistant that suggests concise, unique titles for markdown notes. 
Return only the new title without a file extension. 
Keep it under 60 characters and avoid special characters like / \\ : * ? " < > |.`
export const MAX_NOTE_CONTEXT_LENGTH = 4000

// Regex patterns for filename sanitization
export const MARKDOWN_EXT_REGEX = /\.md$/i
export const INVALID_FILENAME_CHARS_REGEX = /[<>:"/\\|?*]/g
export const MULTIPLE_WHITESPACE_REGEX = /\s+/g
export const TRAILING_DOTS_REGEX = /\.+$/

export function createModelFromConfig(config: {
  provider: string
  model: string
  apiKey: string
}) {
  switch (config.provider) {
    case 'anthropic':
      return createAnthropic({
        apiKey: config.apiKey,
      })(config.model)
    case 'google':
      return createGoogleGenerativeAI({
        apiKey: config.apiKey,
      })(config.model)
    case 'openai':
      return createOpenAI({
        apiKey: config.apiKey,
      })(config.model)
    case 'ollama':
      return ollama(config.model)
    default:
      throw new Error(`Unsupported provider: ${config.provider}`)
  }
}

export async function collectSiblingNoteNames(
  directoryPath: string,
  currentFileName: string
): Promise<string[]> {
  try {
    const entries = await readDir(directoryPath)

    return entries
      .filter(
        (entry) =>
          Boolean(entry.name) &&
          entry.name !== currentFileName &&
          !entry.name?.startsWith('.') &&
          entry.name?.toLowerCase().endsWith('.md')
      )
      .map((entry) => stripExtension(entry.name as string, '.md').trim())
      .filter((name) => name.length > 0)
      .slice(0, 30)
  } catch (error) {
    console.error('Failed to read sibling notes:', directoryPath, error)
    return []
  }
}

export function buildRenamePrompt({
  currentName,
  otherNoteNames,
  content,
  directoryPath,
}: {
  currentName: string
  otherNoteNames: string[]
  content: string
  directoryPath: string
}) {
  const truncatedContent =
    content.length > MAX_NOTE_CONTEXT_LENGTH
      ? `${content.slice(0, MAX_NOTE_CONTEXT_LENGTH)}\n…`
      : content

  const others =
    otherNoteNames.length > 0
      ? otherNoteNames.map((name) => `- ${name}`).join('\n')
      : 'None'

  return `Generate a better file name for a markdown note. 
- The note is currently called "${stripExtension(currentName, '.md')}".
- The note resides in the folder: ${directoryPath}.
- Other notes in this folder:\n${others}

Note content:
---
${truncatedContent}
---

Respond with a single title (no quotes, no markdown, no extension).`
}

export function extractName(raw: string) {
  return raw
    .split('\n')[0]
    .replace(/[`"'<>]/g, ' ')
    .trim()
}

export function sanitizeFileName(name: string) {
  const withoutMd = name.replace(MARKDOWN_EXT_REGEX, '')
  const cleaned = withoutMd
    .replace(INVALID_FILENAME_CHARS_REGEX, ' ')
    .replace(MULTIPLE_WHITESPACE_REGEX, ' ')
    .replace(TRAILING_DOTS_REGEX, '')
    .trim()

  const truncated = cleaned.slice(0, 60).trim()

  return truncated
}

export function getFileExtension(fileName: string) {
  const index = fileName.lastIndexOf('.')
  if (index <= 0) return ''
  return fileName.slice(index)
}

export function stripExtension(fileName: string, extension: string) {
  return extension && fileName.toLowerCase().endsWith(extension.toLowerCase())
    ? fileName.slice(0, -extension.length)
    : fileName
}

export async function ensureUniqueFileName(
  directoryPath: string,
  baseName: string,
  extension: string,
  currentPath: string
) {
  let attempt = 0

  // Always have a fallback extension for markdown notes
  const safeExtension = extension || '.md'

  while (attempt < 100) {
    const suffix = attempt === 0 ? '' : ` ${attempt}`
    const candidateBase = `${baseName}${suffix}`.trim()
    const candidateFileName = `${candidateBase}${safeExtension}`
    const nextPath = await join(directoryPath, candidateFileName)

    if (nextPath === currentPath) {
      return { fileName: candidateFileName, fullPath: nextPath }
    }

    if (!(await exists(nextPath))) {
      return { fileName: candidateFileName, fullPath: nextPath }
    }

    attempt += 1
  }

  throw new Error('Unable to find a unique filename.')
}
