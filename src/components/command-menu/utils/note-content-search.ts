import { Command } from '@tauri-apps/plugin-shell'
import { platform } from '@tauri-apps/plugin-os'

export type MarkdownContentMatch = {
  path: string
  lineNumber: number
  lineText: string
}

type SearchOptions = {
  maxResults?: number
}

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
  const os = platform()

  let command: ReturnType<typeof Command.create>
  let parseOutput: (stdout: string) => MarkdownContentMatch[]

  if (os === 'windows') {
    // Windows: Use findstr (built-in command)
    // Note: findstr doesn't natively support .gitignore, so we filter common ignored directories in post-processing
    command = Command.create('findstr', [
      '/S', // Search subdirectories
      '/I', // Case-insensitive
      '/N', // Include line numbers
      '/C:' + trimmedQuery, // Search string
      workspacePath + '\\*.md', // Markdown files only
    ])
    parseOutput = (stdout) => parseFindstrOutput(stdout, workspacePath)
  } else {
    // macOS/Linux: Use grep
    command = Command.create('grep', [
      '-R', // Recursive search
      '-n', // Show line numbers
      '--null', // Use null delimiter
      '--color=never', // No color output
      '--binary-files=without-match', // Skip binary files
      '--include=*.md', // Markdown files only
      '--exclude-dir=.git', // Respect common ignore patterns
      '--exclude-dir=node_modules',
      '--exclude-dir=.vscode',
      '--exclude-dir=dist',
      '--exclude-dir=build',
      '-F', // Fixed string (not regex)
      '-i', // Case-insensitive
      trimmedQuery,
      workspacePath,
    ])
    parseOutput = parseGrepOutput
  }

  const output = await command.execute()

  // exit code 1 = 매칭 결과 없음
  if (output.code === 1) {
    return []
  }

  if (output.code !== 0) {
    throw new Error(
      output.stderr ||
        `Search command exited with unexpected status ${output.code}`
    )
  }

  const matches = parseOutput(output.stdout)
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

function parseFindstrOutput(
  stdout: string,
  workspacePath: string
): MarkdownContentMatch[] {
  const matches: MarkdownContentMatch[] = []

  // Common directories to ignore (similar to .gitignore)
  const ignoredDirs = [
    '\\.git\\',
    '\\node_modules\\',
    '\\.vscode\\',
    '\\dist\\',
    '\\build\\',
    '\\out\\',
    '\\.next\\',
  ]

  // findstr output format: "<path>:<lineNumber>:<lineText>"
  for (const rawLine of stdout.split(NEWLINE_REGEX)) {
    if (!rawLine) {
      continue
    }

    // First colon is after Windows drive letter (C:)
    // Second colon is after file path
    // Third colon is after line number
    const firstColonIndex = rawLine.indexOf(':')
    if (firstColonIndex === -1 || firstColonIndex !== 1) {
      // Not a Windows drive letter
      continue
    }

    // Extract the part after "C:"
    const afterDrive = rawLine.slice(firstColonIndex + 1)
    const secondColonIndex = afterDrive.indexOf(':')

    if (secondColonIndex === -1) {
      continue
    }

    const path = rawLine.slice(0, firstColonIndex + 1 + secondColonIndex)
    
    // Filter out common ignored directories
    const shouldIgnore = ignoredDirs.some((ignoredDir) =>
      path.includes(ignoredDir)
    )
    if (shouldIgnore) {
      continue
    }

    const rest = afterDrive.slice(secondColonIndex + 1)
    const thirdColonIndex = rest.indexOf(':')

    if (thirdColonIndex === -1) {
      continue
    }

    const lineNumber = Number.parseInt(rest.slice(0, thirdColonIndex), 10)
    if (!Number.isFinite(lineNumber)) {
      continue
    }

    const lineText = rest.slice(thirdColonIndex + 1).replace(TRAILING_CR_REGEX, '')

    matches.push({
      path,
      lineNumber,
      lineText,
    })
  }

  return matches
}
