import { describe, expect, it } from 'vitest'

import type { WorkspaceEntry } from '../../workspace-store'
import {
  addEntryToState,
  findEntryByPath,
  findParentDirectory,
  moveEntryInState,
  removeEntriesFromState,
  removeEntryFromState,
  sortWorkspaceEntries,
  updateChildPathsForMove,
  updateEntryInState,
  updateEntryMetadata,
} from './entry-utils'

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

describe('sortWorkspaceEntries', () => {
  it('sorts directories first and prioritizes untitled files', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/root/B', 'B', [
        makeFile('/root/B/b.md', 'b.md'),
        makeFile('/root/B/Untitled 2.md', 'Untitled 2.md'),
      ]),
      makeDir('/root/A', 'A', [
        makeFile('/root/A/b.md', 'b.md'),
        makeFile('/root/A/Untitled 1.md', 'Untitled 1.md'),
      ]),
      makeFile('/root/note.md', 'note.md'),
      makeFile('/root/Untitled 3.md', 'Untitled 3.md'),
      makeFile('/root/alpha.md', 'alpha.md'),
    ]

    const result = sortWorkspaceEntries(entries)

    expect(result.map((entry) => entry.name)).toEqual([
      'A',
      'B',
      'Untitled 3.md',
      'alpha.md',
      'note.md',
    ])
    expect(result[0].children?.map((entry) => entry.name)).toEqual([
      'Untitled 1.md',
      'b.md',
    ])
    expect(result[1].children?.map((entry) => entry.name)).toEqual([
      'Untitled 2.md',
      'b.md',
    ])
  })
})

describe('removeEntriesFromState / removeEntryFromState', () => {
  it('removes matching entries recursively', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/folder', 'folder', [
        makeFile('/folder/file-1.md', 'file-1.md'),
        makeFile('/folder/file-2.md', 'file-2.md'),
      ]),
      makeFile('/keep.md', 'keep.md'),
      makeFile('/remove.md', 'remove.md'),
    ]

    const result = removeEntriesFromState(entries, [
      '/folder/file-1.md',
      '/remove.md',
    ])

    expect(result).toHaveLength(2)
    expect(result[0].children).toEqual([
      makeFile('/folder/file-2.md', 'file-2.md'),
    ])
    expect(result[1].name).toBe('keep.md')
  })

  it('removes a single entry', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/folder', 'folder', [makeFile('/folder/file.md', 'file.md')]),
      makeFile('/root.md', 'root.md'),
    ]

    const result = removeEntryFromState(entries, '/folder')

    expect(result).toEqual([makeFile('/root.md', 'root.md')])
  })
})

describe('findEntryByPath', () => {
  it('finds nested entries and returns null when missing', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/folder', 'folder', [
        makeDir('/folder/sub', 'sub', [
          makeFile('/folder/sub/file.md', 'file.md'),
        ]),
      ]),
    ]

    expect(findEntryByPath(entries, '/folder/sub/file.md')?.name).toBe(
      'file.md'
    )
    expect(findEntryByPath(entries, '/not-found')).toBeNull()
  })
})

describe('findParentDirectory', () => {
  it('returns directory entries only', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/folder', 'folder', [makeFile('/folder/file.md', 'file.md')]),
    ]

    expect(findParentDirectory(entries, '/folder')?.name).toBe('folder')
    expect(findParentDirectory(entries, '/folder/file.md')).toBeNull()
  })
})

describe('addEntryToState', () => {
  it('adds a new child and keeps entries sorted', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/folder', 'folder', [
        makeFile('/folder/existing.md', 'existing.md'),
      ]),
    ]

    const newEntry = makeFile('/folder/new.md', 'new.md')
    const result = addEntryToState(entries, '/folder', newEntry)

    expect(result[0].children?.map((entry) => entry.name)).toEqual([
      'existing.md',
      'new.md',
    ])
  })

  it('skips insertion when the entry already exists', () => {
    const existing = makeFile('/folder/existing.md', 'existing.md')
    const entries: WorkspaceEntry[] = [makeDir('/folder', 'folder', [existing])]

    const result = addEntryToState(entries, '/folder', existing)

    expect(result).toEqual(entries)
  })
})

describe('updateEntryInState', () => {
  it('renames files', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/root', 'root', [makeFile('/root/note.md', 'note.md')]),
      makeFile('/file.md', 'file.md'),
    ]

    const result = updateEntryInState(
      entries,
      '/file.md',
      '/new-file.md',
      'new-file.md'
    )
    const renamedFile = result.find((entry) => entry.name === 'new-file.md')
    const oldFile = result.find((entry) => entry.name === 'file.md')

    expect(renamedFile?.path).toBe('/new-file.md')
    expect(oldFile).toBeUndefined()
    expect(result.find((entry) => entry.name === 'root')).not.toBeUndefined()
  })

  it('renames entries and updates descendant paths', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/root/old', 'old', [makeFile('/root/old/note.md', 'note.md')]),
      makeFile('/root/file.md', 'file.md'),
    ]

    const result = updateEntryInState(entries, '/root/old', '/root/new', 'new')
    const updatedDir = result.find((entry) => entry.name === 'new')

    expect(updatedDir?.path).toBe('/root/new')
    expect(updatedDir?.children?.[0].path).toBe('/root/new/note.md')
    expect(result.find((entry) => entry.name === 'file.md')?.path).toBe(
      '/root/file.md'
    )
  })

  it('sorts root entries after renaming', () => {
    const entries: WorkspaceEntry[] = [
      makeFile('/zebra.md', 'zebra.md'),
      makeFile('/alpha.md', 'alpha.md'),
      makeFile('/beta.md', 'beta.md'),
    ]

    const result = updateEntryInState(
      entries,
      '/zebra.md',
      '/aardvark.md',
      'aardvark.md'
    )

    expect(result.map((entry) => entry.name)).toEqual([
      'aardvark.md',
      'alpha.md',
      'beta.md',
    ])
  })

  it('sorts parent directory children after renaming a file', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/folder', 'folder', [
        makeFile('/folder/zebra.md', 'zebra.md'),
        makeFile('/folder/alpha.md', 'alpha.md'),
        makeFile('/folder/beta.md', 'beta.md'),
      ]),
    ]

    const result = updateEntryInState(
      entries,
      '/folder/zebra.md',
      '/folder/aardvark.md',
      'aardvark.md'
    )

    const folder = result.find((entry) => entry.name === 'folder')
    expect(folder?.children?.map((entry) => entry.name)).toEqual([
      'aardvark.md',
      'alpha.md',
      'beta.md',
    ])
  })

  it('sorts parent directory children after renaming a directory', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/parent', 'parent', [
        makeDir('/parent/zebra', 'zebra', []),
        makeDir('/parent/alpha', 'alpha', []),
        makeDir('/parent/beta', 'beta', []),
      ]),
    ]

    const result = updateEntryInState(
      entries,
      '/parent/zebra',
      '/parent/aardvark',
      'aardvark'
    )

    const parent = result.find((entry) => entry.name === 'parent')
    expect(parent?.children?.map((entry) => entry.name)).toEqual([
      'aardvark',
      'alpha',
      'beta',
    ])
  })

  it('sorts entries correctly when renaming maintains alphabetical order', () => {
    const entries: WorkspaceEntry[] = [
      makeFile('/alpha.md', 'alpha.md'),
      makeFile('/beta.md', 'beta.md'),
      makeFile('/gamma.md', 'gamma.md'),
    ]

    const result = updateEntryInState(
      entries,
      '/beta.md',
      '/beta-renamed.md',
      'beta-renamed.md'
    )

    expect(result.map((entry) => entry.name)).toEqual([
      'alpha.md',
      'beta-renamed.md',
      'gamma.md',
    ])
  })

  it('sorts nested directory children after renaming', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/root', 'root', [
        makeDir('/root/parent', 'parent', [
          makeFile('/root/parent/z.md', 'z.md'),
          makeFile('/root/parent/a.md', 'a.md'),
          makeFile('/root/parent/m.md', 'm.md'),
        ]),
      ]),
    ]

    const result = updateEntryInState(
      entries,
      '/root/parent/z.md',
      '/root/parent/alpha.md',
      'alpha.md'
    )

    const parent = result
      .find((entry) => entry.name === 'root')
      ?.children?.find((entry) => entry.name === 'parent')
    expect(parent?.children?.map((entry) => entry.name)).toEqual([
      'a.md',
      'alpha.md',
      'm.md',
    ])
  })
})

describe('updateChildPathsForMove', () => {
  it('re-roots a subtree to a new parent', () => {
    const entry = makeDir('/old/child', 'child', [
      makeFile('/old/child/nested.md', 'nested.md'),
    ])

    const result = updateChildPathsForMove(entry, '/old', '/new')

    expect(result.path).toBe('/new/child')
    expect(result.children?.[0].path).toBe('/new/child/nested.md')
  })
})

describe('moveEntryInState', () => {
  it('moves files', () => {
    const entries: WorkspaceEntry[] = [
      makeFile('/source.md', 'source.md'),
      makeDir('/destination', 'destination', []),
    ]

    const result = moveEntryInState(entries, '/source.md', '/destination')
    const destination = result.find((entry) => entry.path === '/destination')
    const moved = destination?.children?.find(
      (entry) => entry.name === 'source.md'
    )

    expect(findEntryByPath(result, '/source.md')).toBeNull()
    expect(moved?.path).toBe('/destination/source.md')
    expect(moved?.children).toBeUndefined()
  })

  it('moves directories and rewrites child paths', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/source', 'source', [makeFile('/source/note.md', 'note.md')]),
      makeDir('/destination', 'destination', []),
    ]

    const result = moveEntryInState(entries, '/source', '/destination')
    const destination = result.find((entry) => entry.path === '/destination')
    const moved = destination?.children?.find(
      (entry) => entry.name === 'source'
    )

    expect(findEntryByPath(result, '/source')).toBeNull()
    expect(moved?.path).toBe('/destination/source')
    expect(moved?.children?.[0].path).toBe('/destination/source/note.md')
  })

  it('moves files to workspace root', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/subdir', 'subdir', [
        makeFile('/subdir/source.md', 'source.md'),
      ]),
      makeFile('/root-file.md', 'root-file.md'),
    ]

    const result = moveEntryInState(entries, '/subdir/source.md', '/', '/')

    expect(findEntryByPath(result, '/subdir/source.md')).toBeNull()
    const moved = result.find((entry) => entry.path === '/source.md')
    expect(moved).toBeDefined()
    expect(moved?.path).toBe('/source.md')
    expect(moved?.name).toBe('source.md')
    expect(moved?.isDirectory).toBe(false)
  })

  it('moves directories to workspace root and rewrites child paths', () => {
    const entries: WorkspaceEntry[] = [
      makeDir('/subdir', 'subdir', [
        makeDir('/subdir/source', 'source', [
          makeFile('/subdir/source/note.md', 'note.md'),
          makeFile('/subdir/source/other.md', 'other.md'),
        ]),
      ]),
      makeFile('/root-file.md', 'root-file.md'),
    ]

    const result = moveEntryInState(entries, '/subdir/source', '/', '/')

    expect(findEntryByPath(result, '/subdir/source')).toBeNull()
    const moved = result.find((entry) => entry.path === '/source')
    expect(moved).toBeDefined()
    expect(moved?.path).toBe('/source')
    expect(moved?.name).toBe('source')
    expect(moved?.isDirectory).toBe(true)
    expect(moved?.children?.[0].path).toBe('/source/note.md')
    expect(moved?.children?.[1].path).toBe('/source/other.md')
  })
})

describe('updateEntryMetadata', () => {
  it('merges new metadata on the target entry', () => {
    const created = new Date('2024-01-01T00:00:00Z')
    const modified = new Date('2024-02-02T00:00:00Z')
    const entries: WorkspaceEntry[] = [
      makeFile('/file.md', 'file.md'),
      makeDir('/folder', 'folder', [makeFile('/folder/child.md', 'child.md')]),
    ]

    const result = updateEntryMetadata(entries, '/folder/child.md', {
      createdAt: created,
      modifiedAt: modified,
    })
    const updated = findEntryByPath(result, '/folder/child.md')

    expect(updated?.createdAt).toEqual(created)
    expect(updated?.modifiedAt).toEqual(modified)
    expect(result[0].createdAt).toBeUndefined()
  })
})
