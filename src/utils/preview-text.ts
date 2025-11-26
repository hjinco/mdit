/**
 * Format raw markdown preview text into a concise single-line string.
 * Applies lightweight markdown stripping to align with file explorer preview rules.
 */

// Regex patterns defined at top level for performance
const BOM_PATTERN = /\uFEFF/g
const ZERO_WIDTH_SPACE_PATTERN = /\u200B/g
const LINE_BREAK_PATTERN = /\r?\n/
const FENCE_PATTERN = /^\s*(```|~~~)/
const SETEXT_UNDERLINE_OR_HR_PATTERN = /^[-=]{3,}$/
const MARKDOWN_IMAGE_PATTERN = /^!\[.*\]\(.*\)/
const WIKI_STYLE_EMBED_PATTERN = /^!\[\[.*\]\]/
const HTML_BLOCK_PATTERN =
  /^<\/?\s*(table|thead|tbody|tr|td|th|blockquote|pre|code|img)(\s|>|\/)/i
const HEADING_PATTERN = /^#+\s*/
const BULLET_MARKER_PATTERN = /^[#>*+\-*\s]+/
const INLINE_IMAGE_PATTERN = /!\[[^\]]*]\([^)]*\)/g
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)]\([^)]*\)/g
const REFERENCE_LINK_PATTERN = /\[([^\]]+)]\[[^\]]*]/g
const STRIKETHROUGH_PATTERN = /~~([^~]+)~~/g
const STRONG_EMPHASIS_PATTERN = /(\*\*|__)(.+?)\1/g
const EMPHASIS_PATTERN = /(\*|_)(.+?)\1/g
const INLINE_CODE_PATTERN = /`([^`]+)`/g
const BRACKET_PATTERN = /[[\]]/g
const MULTIPLE_ASTERISKS_PATTERN = /\*{2,}/g
const MULTIPLE_UNDERSCORES_PATTERN = /_{2,}/g
const MULTIPLE_TILDES_PATTERN = /~{2,}/g
const WHITESPACE_PATTERN = /\s+/g
const ESCAPED_PUNCTUATION_PATTERN = /\\([\\[\]()`*_.~!#+-])/g

export function formatPreviewText(raw: string): string {
  if (!raw) return ''

  const cleaned = raw
    .replace(BOM_PATTERN, '')
    .replace(ZERO_WIDTH_SPACE_PATTERN, '')
  const lines = cleaned.split(LINE_BREAK_PATTERN)
  let inFence = false
  const cleanedLines: string[] = []

  for (const line of lines) {
    let candidate = line.trimEnd()

    // Toggle fenced code blocks and skip their content
    const fenceMatch = candidate.match(FENCE_PATTERN)
    if (fenceMatch) {
      if (inFence) {
        inFence = false
      } else {
        inFence = true
      }
      continue
    }

    if (inFence) {
      continue
    }

    candidate = candidate.trim()
    if (!candidate) continue

    // Skip block-level elements that shouldn't appear in previews
    if (
      candidate.startsWith('>') || // blockquote
      candidate.startsWith('|') || // table row
      SETEXT_UNDERLINE_OR_HR_PATTERN.test(candidate) || // setext underline or hr
      MARKDOWN_IMAGE_PATTERN.test(candidate) || // markdown image
      WIKI_STYLE_EMBED_PATTERN.test(candidate) || // wiki-style embed
      HTML_BLOCK_PATTERN.test(candidate)
    ) {
      continue
    }

    const formatted = cleanInline(candidate, candidate.startsWith('#'))
    if (formatted) {
      cleanedLines.push(formatted)
    }
  }

  if (!cleanedLines.length) return ''
  return cleanedLines.join(' ').trim()
}

function cleanInline(value: string, isHeading: boolean) {
  let result = value

  if (isHeading) {
    result = result.replace(HEADING_PATTERN, '')
  }

  // Remove leading bullet/marker noise
  result = result.replace(BULLET_MARKER_PATTERN, '')

  // Drop inline images entirely
  result = result.replace(INLINE_IMAGE_PATTERN, '')

  // Keep link text, drop wrappers
  result = result
    .replace(MARKDOWN_LINK_PATTERN, '$1')
    .replace(REFERENCE_LINK_PATTERN, '$1')

  // Strip emphasis markers but keep content
  result = result.replace(STRIKETHROUGH_PATTERN, '$1')
  result = result.replace(STRONG_EMPHASIS_PATTERN, '$2')
  result = result.replace(EMPHASIS_PATTERN, '$2')

  // Strip inline code ticks
  result = result.replace(INLINE_CODE_PATTERN, '$1')

  // Collapse leftover markdown punctuation/markers
  result = result
    .replace(BRACKET_PATTERN, '')
    .replace(MULTIPLE_ASTERISKS_PATTERN, '')
    .replace(MULTIPLE_UNDERSCORES_PATTERN, '')
    .replace(MULTIPLE_TILDES_PATTERN, '')
    .replace(ESCAPED_PUNCTUATION_PATTERN, '$1')

  // Normalize whitespace
  result = result.replace(WHITESPACE_PATTERN, ' ').trim()

  return result
}
