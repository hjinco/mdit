import { describe, expect, it } from 'vitest'
import type { WorkspaceEntry } from '../../workspace/workspace-slice'
import { computeCollectionEntries } from './collection-entries'

const makeFile = (
  path: string,
  name: string,
  overrides: Partial<WorkspaceEntry> = {}
): WorkspaceEntry => ({
  path,
  name,
  isDirectory: false,
  children: undefined,
  createdAt: undefined,
  modifiedAt: undefined,
  ...overrides,
})

const makeDir = (
  path: string,
  name: string,
  children: WorkspaceEntry[] = []
): WorkspaceEntry => ({
  path,
  name,
  isDirectory: true,
  children,
  createdAt: undefined,
  modifiedAt: undefined,
})

describe('computeCollectionEntries', () => {
  it('returns empty array when currentCollectionPath is null', () => {
    const entries: WorkspaceEntry[] = [
      makeFile('/workspace/note.md', 'note.md'),
    ]

    expect(computeCollectionEntries(null, entries)).toEqual([])
  })

  it('returns empty array when currentCollectionPath is empty string', () => {
    const entries: WorkspaceEntry[] = [
      makeFile('/workspace/note.md', 'note.md'),
    ]

    expect(computeCollectionEntries('', entries)).toEqual([])
  })

  it('returns markdown files from nested folder', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/workspace/folder', 'folder', [
        makeFile('/workspace/folder/note1.md', 'note1.md'),
        makeFile('/workspace/folder/note2.md', 'note2.md'),
        makeFile('/workspace/folder/image.png', 'image.png'),
        makeDir('/workspace/folder/subfolder', 'subfolder', [
          makeFile('/workspace/folder/subfolder/nested.md', 'nested.md'),
        ]),
      ]),
    ]

    const result = computeCollectionEntries('/workspace/folder', entries)

    expect(result).toHaveLength(2)
    expect(result.map((e) => e.name)).toEqual(['note1.md', 'note2.md'])
  })

  it('excludes non-markdown files', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/workspace/folder', 'folder', [
        makeFile('/workspace/folder/note.md', 'note.md'),
        makeFile('/workspace/folder/image.png', 'image.png'),
        makeFile('/workspace/folder/document.txt', 'document.txt'),
        makeFile('/workspace/folder/README.MD', 'README.MD'), // uppercase
      ]),
    ]

    const result = computeCollectionEntries('/workspace/folder', entries)

    expect(result).toHaveLength(2)
    expect(result.map((e) => e.name)).toEqual(['note.md', 'README.MD'])
  })

  it('excludes directories', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/workspace/folder', 'folder', [
        makeFile('/workspace/folder/note.md', 'note.md'),
        makeDir('/workspace/folder/subfolder', 'subfolder', []),
      ]),
    ]

    const result = computeCollectionEntries('/workspace/folder', entries)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('note.md')
  })

  it('returns empty array when folder does not exist', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/workspace/folder', 'folder', []),
    ]

    const result = computeCollectionEntries('/workspace/nonexistent', entries)

    expect(result).toEqual([])
  })

  it('returns empty array when path points to a file instead of directory', () => {
    const entries: WorkspaceEntry[] = [
      makeFile('/workspace/note.md', 'note.md'),
    ]

    const result = computeCollectionEntries('/workspace/note.md', entries)

    expect(result).toEqual([])
  })

  it('returns empty array when folder has no children', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/workspace/folder', 'folder', []),
    ]

    const result = computeCollectionEntries('/workspace/folder', entries)

    expect(result).toEqual([])
  })

  it('handles deeply nested folders', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/workspace/level1', 'level1', [
        makeDir('/workspace/level1/level2', 'level2', [
          makeDir('/workspace/level1/level2/level3', 'level3', [
            makeFile('/workspace/level1/level2/level3/note.md', 'note.md'),
            makeFile('/workspace/level1/level2/level3/other.md', 'other.md'),
          ]),
        ]),
      ]),
    ]

    const result = computeCollectionEntries(
      '/workspace/level1/level2/level3',
      entries
    )

    expect(result).toHaveLength(2)
    expect(result.map((e) => e.name)).toEqual(['note.md', 'other.md'])
  })

  it('handles workspacePath being null', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/workspace/folder', 'folder', [
        makeFile('/workspace/folder/note.md', 'note.md'),
      ]),
    ]

    const result = computeCollectionEntries('/workspace/folder', entries)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('note.md')
  })

  it('handles case-insensitive markdown extension matching', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/workspace/folder', 'folder', [
        makeFile('/workspace/folder/note.md', 'note.md'),
        makeFile('/workspace/folder/README.MD', 'README.MD'),
        makeFile('/workspace/folder/Note.Md', 'Note.Md'),
      ]),
    ]

    const result = computeCollectionEntries('/workspace/folder', entries)

    expect(result).toHaveLength(3)
    expect(result.map((e) => e.name)).toEqual([
      'note.md',
      'README.MD',
      'Note.Md',
    ])
  })
})
