import { describe, expect, it } from 'vitest'

import { removePathFromHistory } from './history-utils'

describe('removePathFromHistory', () => {
  it('removes every occurrence of a path and adjusts the index', () => {
    expect(
      removePathFromHistory(
        ['/notes/a.md', '/notes/b.md', '/notes/a.md'],
        2,
        '/notes/a.md'
      )
    ).toEqual({
      history: ['/notes/b.md'],
      historyIndex: 0,
    })
  })

  it('returns -1 when the history becomes empty', () => {
    expect(removePathFromHistory(['/notes/a.md'], 0, '/notes/a.md')).toEqual({
      history: [],
      historyIndex: -1,
    })
  })

  it('clamps the index when it exceeds the new history length', () => {
    expect(
      removePathFromHistory(['/notes/a.md', '/notes/b.md'], 1, '/notes/b.md')
    ).toEqual({
      history: ['/notes/a.md'],
      historyIndex: 0,
    })
  })

  it('clamps a negative index to zero when history remains', () => {
    expect(
      removePathFromHistory(['/notes/a.md', '/notes/b.md'], -1, '/notes/a.md')
    ).toEqual({
      history: ['/notes/b.md'],
      historyIndex: 0,
    })
  })

  it('keeps history and index when the path is missing', () => {
    expect(
      removePathFromHistory(
        ['/notes/a.md', '/notes/b.md', '/notes/c.md'],
        1,
        '/notes/missing.md'
      )
    ).toEqual({
      history: ['/notes/a.md', '/notes/b.md', '/notes/c.md'],
      historyIndex: 1,
    })
  })

  it('selects the first remaining entry when all earlier entries are removed', () => {
    expect(
      removePathFromHistory(
        ['/notes/a.md', '/notes/a.md', '/notes/a.md', '/notes/b.md'],
        2,
        '/notes/a.md'
      )
    ).toEqual({
      history: ['/notes/b.md'],
      historyIndex: 0,
    })
  })
})
