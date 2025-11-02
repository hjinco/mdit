import type { ReactNode } from 'react'

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Highlight occurrences of the query using <mark> nodes while preserving the original text structure.
export const highlightQuery = (text: string, query: string): ReactNode => {
  if (!query) {
    return text
  }

  try {
    const regex = new RegExp(escapeRegExp(query), 'gi')
    const fragments: ReactNode[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null = regex.exec(text)

    while (match) {
      if (match.index > lastIndex) {
        fragments.push(text.slice(lastIndex, match.index))
      }

      fragments.push(
        <mark key={`${match.index}-${match[0]}`} className="bg-transparent">
          {match[0]}
        </mark>
      )

      lastIndex = match.index + match[0].length

      if (match[0].length === 0) {
        regex.lastIndex += 1
      }

      match = regex.exec(text)
    }

    if (lastIndex < text.length) {
      fragments.push(text.slice(lastIndex))
    }

    return fragments.length > 0 ? fragments : text
  } catch {
    // Fall back gracefully when the query cannot be turned into a RegExp (e.g. unmatched brackets).
    return text
  }
}
