import { Command } from '@tauri-apps/plugin-shell'

export type MarkdownContentMatch = {
  path: string
  lineNumber: number
  lineText: string
}

type SearchOptions = {
  maxResults?: number
}

const SEARCH_COMMAND_NAME = 'grep'
const DEFAULT_MAX_RESULTS = 50
const NEWLINE_REGEX = /\r?\n/
const TRAILING_CR_REGEX = /\r$/

export async function searchMarkdownContent(
  query: string,
  workspacePath: string,
  options: SearchOptions = {}
): Promise<MarkdownContentMatch[]> {
  const trimmedQuery = query.trim()
  if (!trimmedQuery || !workspacePath.trim()) {
    return []
  }

  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS

  const command = Command.create(SEARCH_COMMAND_NAME, [
    '-R',
    '-n',
    '--null',
    '--color=never',
    '--binary-files=without-match',
    '--include=*.md',
    '-F',
    '-i',
    trimmedQuery,
    workspacePath,
  ])

  const output = await command.execute()

  if (output.code === 1) {
    return []
  }

  if (output.code !== 0) {
    throw new Error(
      output.stderr || `grep exited with unexpected status ${output.code}`
    )
  }

  const matches = parseGrepOutput(output.stdout)
  if (!matches.length) {
    return []
  }

  return matches.slice(0, maxResults)
}

function parseGrepOutput(stdout: string): MarkdownContentMatch[] {
  const matches: MarkdownContentMatch[] = []

  // Each match is formatted as "<path>\0<lineNumber>:<lineText>" thanks to `--null`.
  for (const rawLine of stdout.split(NEWLINE_REGEX)) {
    if (!rawLine) {
      continue
    }

    const nullIndex = rawLine.indexOf('\0')
    if (nullIndex === -1) {
      continue
    }

    const path = rawLine.slice(0, nullIndex)
    const rest = rawLine.slice(nullIndex + 1)
    const colonIndex = rest.indexOf(':')

    if (colonIndex === -1) {
      continue
    }

    const lineNumber = Number.parseInt(rest.slice(0, colonIndex), 10)
    if (!Number.isFinite(lineNumber)) {
      continue
    }

    const lineText = rest.slice(colonIndex + 1).replace(TRAILING_CR_REGEX, '')

    matches.push({
      path,
      lineNumber,
      lineText,
    })
  }

  return matches
}
