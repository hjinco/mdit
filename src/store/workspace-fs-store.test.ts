import { join } from 'pathe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findEntryByPath } from './workspace/utils/entry-utils'
import { rewriteMarkdownRelativeLinks } from './workspace/utils/markdown-link-utils'
import { createWorkspaceFsStore } from './workspace-fs-store-core'
import type { WorkspaceEntry } from './workspace-store'

type WorkspaceSnapshot = {
  workspacePath: string | null
  entries: WorkspaceEntry[]
  expandedDirectories: string[]
  pinnedDirectories: string[]
}

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
  children: WorkspaceEntry[] = [],
  overrides: Partial<WorkspaceEntry> = {}
): WorkspaceEntry => ({
  path,
  name,
  isDirectory: true,
  children,
  createdAt: undefined,
  modifiedAt: undefined,
  ...overrides,
})

function createHarness(options?: {
  workspacePath?: string | null
  entries?: WorkspaceEntry[]
  expandedDirectories?: string[]
  pinnedDirectories?: string[]
}) {
  const snapshot: WorkspaceSnapshot = {
    workspacePath:
      options?.workspacePath === undefined ? '/ws' : options.workspacePath,
    entries: options?.entries ?? [],
    expandedDirectories: options?.expandedDirectories ?? [],
    pinnedDirectories: options?.pinnedDirectories ?? [],
  }

  const fileSystemRepository = {
    exists: vi.fn(async (_path: string) => false),
    mkdir: vi.fn(
      async (_path: string, _options?: { recursive?: boolean }) => {}
    ),
    readDir: vi.fn(async (_path: string) => []),
    readTextFile: vi.fn(async (_path: string) => ''),
    rename: vi.fn(async (_from: string, _to: string) => {}),
    writeTextFile: vi.fn(async (_path: string, _contents: string) => {}),
    moveToTrash: vi.fn(async (_path: string) => {}),
    moveManyToTrash: vi.fn(async (_paths: string[]) => {}),
    copy: vi.fn(async (_from: string, _to: string) => {}),
    stat: vi.fn(async (_path: string) => ({ isDirectory: false }) as any),
  }

  const tabSnapshot = {
    tab: null as { path: string } | null,
    isSaved: true,
  }

  const tabStoreAdapter = {
    getSnapshot: vi.fn(() => tabSnapshot),
    openTab: vi.fn(async (_path: string) => {}),
    closeTab: vi.fn((_path: string) => {}),
    clearHistory: vi.fn(() => {}),
    renameTab: vi.fn(
      async (
        _oldPath: string,
        _newPath: string,
        _options?: { refreshContent?: boolean; renameOnFs?: boolean }
      ) => {}
    ),
    updateHistoryPath: vi.fn((_oldPath: string, _newPath: string) => {}),
    removePathFromHistory: vi.fn((_path: string) => {}),
  }

  const collectionState = {
    currentCollectionPath: null as string | null,
    lastCollectionPath: null as string | null,
  }

  const collectionStoreAdapter = {
    getSnapshot: vi.fn(() => ({ ...collectionState })),
    resetCollectionPath: vi.fn(() => {
      collectionState.currentCollectionPath = null
      collectionState.lastCollectionPath = null
    }),
    setCurrentCollectionPath: vi.fn((path: string | null) => {
      collectionState.currentCollectionPath = path
    }),
    clearLastCollectionPath: vi.fn(() => {
      collectionState.lastCollectionPath = null
    }),
  }

  const fileExplorerSelectionAdapter = {
    setSelectedEntryPaths: vi.fn((_paths: Set<string>) => {}),
    setSelectionAnchorPath: vi.fn((_path: string | null) => {}),
  }

  const aiSettingsAdapter = {
    getRenameConfig: vi.fn(() => null as any),
  }

  const workspaceStoreAdapter = {
    getSnapshot: vi.fn(() => snapshot),
    updateEntries: vi.fn(
      (action: (entries: WorkspaceEntry[]) => WorkspaceEntry[]) => {
        snapshot.entries = action(snapshot.entries)
      }
    ),
    applyWorkspaceUpdate: vi.fn(
      async (update: {
        entries?: WorkspaceEntry[]
        expandedDirectories?: string[]
        pinnedDirectories?: string[]
      }) => {
        if (update.entries) {
          snapshot.entries = update.entries
        }
        if (update.expandedDirectories) {
          snapshot.expandedDirectories = update.expandedDirectories
        }
        if (update.pinnedDirectories) {
          snapshot.pinnedDirectories = update.pinnedDirectories
        }
      }
    ),
    setExpandedDirectories: vi.fn(
      async (_action: (expandedDirectories: string[]) => string[]) => {}
    ),
    refreshWorkspaceEntries: vi.fn(async () => {}),
  }

  const generateText = vi.fn(async () => ({ text: '' }))

  const frontmatterUtils = {
    updateFileFrontmatter: vi.fn(async () => true),
    renameFileFrontmatterProperty: vi.fn(async () => true),
    removeFileFrontmatterProperty: vi.fn(async () => true),
  }

  const toast = {
    success: vi.fn(() => {}),
    error: vi.fn(() => {}),
  }

  const aiRenameUtils = {
    AI_RENAME_SYSTEM_PROMPT: 'mock',
    buildRenamePrompt: vi.fn(() => 'prompt'),
    collectSiblingNoteNames: vi.fn(() => []),
    createModelFromConfig: vi.fn(() => ({ provider: 'mock' })),
    extractAndSanitizeName: vi.fn((raw: string) => raw.split('\n')[0].trim()),
  }

  const store = createWorkspaceFsStore({
    fileSystemRepository: fileSystemRepository as any,
    generateText: generateText as any,
    tabStoreAdapter: tabStoreAdapter as any,
    collectionStoreAdapter: collectionStoreAdapter as any,
    fileExplorerSelectionAdapter: fileExplorerSelectionAdapter as any,
    aiSettingsAdapter: aiSettingsAdapter as any,
    workspaceStoreAdapter: workspaceStoreAdapter as any,
    frontmatterUtils: frontmatterUtils as any,
    toast: toast as any,
    aiRenameUtils: aiRenameUtils as any,
  })

  return {
    store,
    snapshot,
    fileSystemRepository,
    generateText,
    frontmatterUtils,
    toast,
    aiRenameUtils,
    tabSnapshot,
    tabStoreAdapter,
    collectionState,
    collectionStoreAdapter,
    fileExplorerSelectionAdapter,
    aiSettingsAdapter,
    workspaceStoreAdapter,
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('workspace-fs-store edge cases', () => {
  it('createFolder returns null when workspacePath is not set', async () => {
    const { store } = createHarness({ workspacePath: null })

    await expect(
      store.getState().createFolder('/ws', 'New Folder')
    ).resolves.toBe(null)
  })

  it('createFolder returns null when name becomes empty after sanitization', async () => {
    const { store } = createHarness({ workspacePath: '/ws' })

    await expect(store.getState().createFolder('/ws', ' /\\  ')).resolves.toBe(
      null
    )
  })

  it('createFolder strips separators and returns null if applyWorkspaceUpdate rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const {
      store,
      workspaceStoreAdapter,
      fileSystemRepository,
      collectionStoreAdapter,
      fileExplorerSelectionAdapter,
    } = createHarness({
      workspacePath: '/ws',
      entries: [],
      expandedDirectories: [],
    })

    workspaceStoreAdapter.applyWorkspaceUpdate.mockRejectedValueOnce(
      new Error('persist failed')
    )

    const folderPath = await store
      .getState()
      .createFolder('/ws', ' foo/bar\\baz ')

    expect(folderPath).toBeNull()
    expect(fileSystemRepository.mkdir).toHaveBeenCalledWith('/ws/foobarbaz', {
      recursive: true,
    })

    expect(
      collectionStoreAdapter.setCurrentCollectionPath
    ).not.toHaveBeenCalled()
    expect(
      fileExplorerSelectionAdapter.setSelectedEntryPaths
    ).not.toHaveBeenCalled()

    expect(consoleError).toHaveBeenCalled()
  })

  it('createNote throws when workspacePath is not set', async () => {
    const { store } = createHarness({ workspacePath: null })

    await expect(store.getState().createNote('/ws')).rejects.toThrow(
      'Workspace path is not set'
    )
  })

  it('createAndOpenNote uses currentCollectionPath over tab directory', async () => {
    const { store, tabSnapshot, collectionState, tabStoreAdapter } =
      createHarness({ workspacePath: '/ws' })

    tabSnapshot.tab = { path: '/ws/somewhere/current.md' }
    collectionState.currentCollectionPath = '/ws/collection'

    await store.getState().createAndOpenNote()

    expect(tabStoreAdapter.openTab).toHaveBeenCalledWith(
      join('/ws/collection', 'Untitled.md')
    )
  })

  it('renameEntry returns original path when trimmed name is empty or unchanged', async () => {
    const entry = makeFile('/ws/note.md', 'note.md')

    const { store, fileSystemRepository } = createHarness({
      workspacePath: '/ws',
      entries: [entry],
    })

    await expect(store.getState().renameEntry(entry, '   ')).resolves.toBe(
      '/ws/note.md'
    )
    await expect(store.getState().renameEntry(entry, 'note.md')).resolves.toBe(
      '/ws/note.md'
    )

    expect(fileSystemRepository.rename).not.toHaveBeenCalled()
  })

  it('moveEntry rejects invalid moves and workspace escapes', async () => {
    const { store } = createHarness({ workspacePath: '/ws' })

    await expect(store.getState().moveEntry('/ws/a', '/ws/a')).resolves.toBe(
      false
    )
    await expect(store.getState().moveEntry('/ws', '/ws/child')).resolves.toBe(
      false
    )
    await expect(
      store.getState().moveEntry('/outside/file.md', '/ws')
    ).resolves.toBe(false)
    await expect(
      store.getState().moveEntry('/ws/file.md', '/outside')
    ).resolves.toBe(false)
  })

  it('moveEntry rewrites markdown links and refreshes tab when content changes', async () => {
    const sourcePath = '/ws/docs/a.md'
    const destinationDir = '/ws/new'
    const newPath = '/ws/new/a.md'

    const entries: WorkspaceEntry[] = [
      makeDir('/ws/docs', 'docs', [makeFile(sourcePath, 'a.md')]),
      makeDir('/ws/new', 'new', []),
    ]

    const {
      store,
      snapshot,
      fileSystemRepository,
      tabStoreAdapter,
      workspaceStoreAdapter,
    } = createHarness({
      workspacePath: '/ws',
      entries,
    })

    const originalContent = 'Install [guide](./assets/setup.md) now.'

    fileSystemRepository.readTextFile.mockImplementation(
      async (path: string) => (path === sourcePath ? originalContent : '')
    )

    const expectedRewritten = rewriteMarkdownRelativeLinks(
      originalContent,
      '/ws/docs',
      destinationDir
    )
    expect(expectedRewritten).not.toBe(originalContent)

    const result = await store.getState().moveEntry(sourcePath, destinationDir)

    expect(result).toBe(true)
    expect(fileSystemRepository.rename).toHaveBeenCalledWith(
      sourcePath,
      newPath
    )

    expect(fileSystemRepository.writeTextFile).toHaveBeenCalledWith(
      newPath,
      expectedRewritten
    )

    expect(tabStoreAdapter.renameTab).toHaveBeenCalledWith(
      sourcePath,
      newPath,
      {
        refreshContent: true,
      }
    )
    expect(tabStoreAdapter.updateHistoryPath).toHaveBeenCalledWith(
      sourcePath,
      newPath
    )
    expect(workspaceStoreAdapter.applyWorkspaceUpdate).toHaveBeenCalled()

    expect(findEntryByPath(snapshot.entries, newPath)).not.toBeNull()
  })

  it('copyEntry returns false on empty source basename and on destination outside workspace', async () => {
    const { store } = createHarness({ workspacePath: '/ws' })

    await expect(store.getState().copyEntry('', '/ws')).resolves.toBe(false)
    await expect(
      store.getState().copyEntry('/ws/file.md', '/outside')
    ).resolves.toBe(false)
  })

  it('copyEntry rewrites markdown links when copying across directories', async () => {
    const sourcePath = '/ws/docs/a.md'
    const destinationDir = '/ws/new'

    const { store, snapshot, fileSystemRepository, workspaceStoreAdapter } =
      createHarness({
        workspacePath: '/ws',
        entries: [makeDir('/ws/new', 'new', [])],
      })

    const newPath = join(destinationDir, 'a.md')

    fileSystemRepository.stat.mockResolvedValue({
      isDirectory: false,
      birthtime: undefined,
      mtime: undefined,
    })

    // generateUniqueFileName uses exists(fullPath) to decide collisions
    fileSystemRepository.exists.mockResolvedValue(false)

    const originalContent = 'Install [guide](./assets/setup.md) now.'
    fileSystemRepository.readTextFile.mockResolvedValue(originalContent)

    const expectedRewritten = rewriteMarkdownRelativeLinks(
      originalContent,
      '/ws/docs',
      destinationDir
    )

    const result = await store.getState().copyEntry(sourcePath, destinationDir)

    expect(result).toBe(true)
    expect(fileSystemRepository.copy).toHaveBeenCalledWith(sourcePath, newPath)

    if (expectedRewritten !== originalContent) {
      expect(fileSystemRepository.writeTextFile).toHaveBeenCalledWith(
        newPath,
        expectedRewritten
      )
    }

    expect(workspaceStoreAdapter.updateEntries).toHaveBeenCalled()
    expect(findEntryByPath(snapshot.entries, newPath)).not.toBeNull()
  })

  it('deleteEntries closes active tab, chooses bulk trash, and clears collection paths', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const paths = ['/ws/a.md', '/ws/b.md', '/ws/folder']

    const initialEntries: WorkspaceEntry[] = [
      makeFile('/ws/a.md', 'a.md'),
      makeFile('/ws/b.md', 'b.md'),
      makeDir('/ws/folder', 'folder', [makeFile('/ws/folder/c.md', 'c.md')]),
    ]

    const {
      store,
      snapshot,
      tabSnapshot,
      tabStoreAdapter,
      fileSystemRepository,
      collectionState,
      collectionStoreAdapter,
    } = createHarness({
      workspacePath: '/ws',
      entries: initialEntries,
      expandedDirectories: ['/ws/folder', '/ws/folder/sub'],
      pinnedDirectories: ['/ws/folder', '/ws/keep'],
    })

    tabSnapshot.tab = { path: '/ws/a.md' }
    tabSnapshot.isSaved = true

    collectionState.currentCollectionPath = '/ws/a.md'
    collectionState.lastCollectionPath = '/ws/folder'

    await store.getState().deleteEntries(paths)

    expect(tabStoreAdapter.closeTab).toHaveBeenCalledWith('/ws/a.md')
    expect(fileSystemRepository.moveManyToTrash).toHaveBeenCalledWith(paths)

    expect(tabStoreAdapter.removePathFromHistory).toHaveBeenCalledTimes(
      paths.length
    )

    expect(
      collectionStoreAdapter.setCurrentCollectionPath
    ).toHaveBeenCalledWith(null)
    expect(collectionStoreAdapter.clearLastCollectionPath).toHaveBeenCalled()

    // expanded/pins should be pruned for deleted folder
    expect(snapshot.expandedDirectories).toEqual([])
    expect(snapshot.pinnedDirectories).toEqual(['/ws/keep'])

    // entries removed (folder and its children are removed by the helper)
    expect(findEntryByPath(snapshot.entries, '/ws/a.md')).toBeNull()
    expect(findEntryByPath(snapshot.entries, '/ws/folder/c.md')).toBeNull()

    expect(consoleError).not.toHaveBeenCalled()
  })

  it('updateEntryModifiedDate swallows stat errors', async () => {
    const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {})

    const { store, fileSystemRepository, workspaceStoreAdapter } =
      createHarness({
        workspacePath: '/ws',
        entries: [makeFile('/ws/a.md', 'a.md')],
      })

    fileSystemRepository.stat.mockRejectedValueOnce(new Error('stat failed'))

    await expect(
      store.getState().updateEntryModifiedDate('/ws/a.md')
    ).resolves.toBeUndefined()

    expect(workspaceStoreAdapter.updateEntries).not.toHaveBeenCalled()
    expect(consoleDebug).toHaveBeenCalled()
  })
})

describe('workspace-fs-store basic behaviors', () => {
  it('recordFsOperation updates lastFsOperationTime', () => {
    const { store } = createHarness({ workspacePath: '/ws' })

    vi.spyOn(Date, 'now').mockReturnValue(123_456)

    expect(store.getState().lastFsOperationTime).toBeNull()
    store.getState().recordFsOperation()
    expect(store.getState().lastFsOperationTime).toBe(123_456)
  })

  it('saveNoteContent writes file and records operation', async () => {
    const { store, fileSystemRepository } = createHarness({
      workspacePath: '/ws',
    })

    vi.spyOn(Date, 'now').mockReturnValue(42)

    await store.getState().saveNoteContent('/ws/a.md', 'hello')

    expect(fileSystemRepository.writeTextFile).toHaveBeenCalledWith(
      '/ws/a.md',
      'hello'
    )
    expect(store.getState().lastFsOperationTime).toBe(42)
  })

  it('createNote creates file, updates entries, and selects the new note', async () => {
    const {
      store,
      snapshot,
      fileSystemRepository,
      fileExplorerSelectionAdapter,
    } = createHarness({ workspacePath: '/ws', entries: [] })

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))

    let filePath: string
    try {
      filePath = await store
        .getState()
        .createNote('/ws', { initialName: 'Hello', initialContent: 'Body' })
    } finally {
      vi.useRealTimers()
    }

    expect(filePath).toBe('/ws/Hello.md')
    expect(fileSystemRepository.writeTextFile).toHaveBeenCalledWith(
      '/ws/Hello.md',
      'Body'
    )

    const created = findEntryByPath(snapshot.entries, '/ws/Hello.md')
    expect(created).not.toBeNull()
    expect(created?.isDirectory).toBe(false)
    expect(created?.createdAt).toBeInstanceOf(Date)
    expect(created?.modifiedAt).toBeInstanceOf(Date)

    expect(
      fileExplorerSelectionAdapter.setSelectedEntryPaths
    ).toHaveBeenCalledWith(new Set(['/ws/Hello.md']))
    expect(
      fileExplorerSelectionAdapter.setSelectionAnchorPath
    ).toHaveBeenCalledWith('/ws/Hello.md')
  })

  it('renameEntry renames on fs and updates workspace state', async () => {
    const entry = makeFile('/ws/note.md', 'note.md')

    const { store, snapshot, fileSystemRepository, tabStoreAdapter } =
      createHarness({
        workspacePath: '/ws',
        entries: [entry],
      })

    const renamedPath = await store.getState().renameEntry(entry, 'new.md')

    expect(renamedPath).toBe('/ws/new.md')
    expect(fileSystemRepository.rename).toHaveBeenCalledWith(
      '/ws/note.md',
      '/ws/new.md'
    )
    expect(tabStoreAdapter.renameTab).toHaveBeenCalledWith(
      '/ws/note.md',
      '/ws/new.md'
    )

    expect(findEntryByPath(snapshot.entries, '/ws/new.md')).not.toBeNull()
    expect(findEntryByPath(snapshot.entries, '/ws/note.md')).toBeNull()
  })

  it('moveEntry moves non-markdown files without link rewrite', async () => {
    const sourcePath = '/ws/docs/a.txt'
    const destinationDir = '/ws/new'
    const newPath = '/ws/new/a.txt'

    const { store, snapshot, fileSystemRepository, tabStoreAdapter } =
      createHarness({
        workspacePath: '/ws',
        entries: [
          makeDir('/ws/docs', 'docs', [makeFile(sourcePath, 'a.txt')]),
          makeDir('/ws/new', 'new', []),
        ],
      })

    const result = await store.getState().moveEntry(sourcePath, destinationDir)

    expect(result).toBe(true)
    expect(fileSystemRepository.rename).toHaveBeenCalledWith(
      sourcePath,
      newPath
    )
    expect(fileSystemRepository.writeTextFile).not.toHaveBeenCalled()
    expect(tabStoreAdapter.renameTab).toHaveBeenCalledWith(
      sourcePath,
      newPath,
      {
        refreshContent: false,
      }
    )

    expect(findEntryByPath(snapshot.entries, newPath)).not.toBeNull()
  })

  it('copyEntry copies a file into workspace and updates entries', async () => {
    const sourcePath = '/outside/a.txt'
    const destinationDir = '/ws/new'
    const newPath = '/ws/new/a.txt'

    const { store, snapshot, fileSystemRepository } = createHarness({
      workspacePath: '/ws',
      entries: [makeDir('/ws/new', 'new', [])],
    })

    fileSystemRepository.stat.mockResolvedValue({
      isDirectory: false,
      birthtime: undefined,
      mtime: undefined,
    })

    const result = await store.getState().copyEntry(sourcePath, destinationDir)

    expect(result).toBe(true)
    expect(fileSystemRepository.copy).toHaveBeenCalledWith(sourcePath, newPath)
    expect(findEntryByPath(snapshot.entries, newPath)).not.toBeNull()
  })

  it('deleteEntries uses moveToTrash for a single path', async () => {
    const { store, fileSystemRepository } = createHarness({
      workspacePath: '/ws',
      entries: [makeFile('/ws/a.md', 'a.md')],
    })

    await store.getState().deleteEntries(['/ws/a.md'])

    expect(fileSystemRepository.moveToTrash).toHaveBeenCalledWith('/ws/a.md')
    expect(fileSystemRepository.moveManyToTrash).not.toHaveBeenCalled()
  })

  it('updateFrontmatter calls helper and updates modified date', async () => {
    const mtime = '2022-01-01T00:00:00.000Z'

    const { store, snapshot, fileSystemRepository, frontmatterUtils } =
      createHarness({
        workspacePath: '/ws',
        entries: [makeFile('/ws/a.md', 'a.md')],
      })

    fileSystemRepository.stat.mockResolvedValue({
      isDirectory: false,
      birthtime: undefined,
      mtime,
    })

    await store.getState().updateFrontmatter('/ws/a.md', { title: 'Test' })

    expect(frontmatterUtils.updateFileFrontmatter).toHaveBeenCalledWith(
      '/ws/a.md',
      {
        title: 'Test',
      }
    )

    const updated = findEntryByPath(snapshot.entries, '/ws/a.md')
    expect(updated?.modifiedAt?.toISOString()).toBe(
      new Date(mtime).toISOString()
    )
  })

  it('renameNoteWithAI renames a markdown file when config is present', async () => {
    const entry = makeFile('/ws/notes/a.md', 'a.md')

    const {
      store,
      fileSystemRepository,
      aiSettingsAdapter,
      generateText,
      toast,
    } = createHarness({
      workspacePath: '/ws',
      entries: [makeDir('/ws/notes', 'notes', [entry])],
    })

    aiSettingsAdapter.getRenameConfig.mockReturnValue({
      provider: 'openai',
      model: 'gpt',
      apiKey: 'x',
    })

    fileSystemRepository.readTextFile.mockResolvedValueOnce('# content')
    fileSystemRepository.readDir.mockResolvedValueOnce([])
    generateText.mockResolvedValueOnce({ text: 'Renamed' })

    await store.getState().renameNoteWithAI(entry)

    expect(fileSystemRepository.rename).toHaveBeenCalledWith(
      '/ws/notes/a.md',
      '/ws/notes/Renamed.md'
    )

    expect(toast.success).toHaveBeenCalled()
    expect(String((toast.success as any).mock.calls[0][0])).toContain(
      'Renamed.md'
    )
  })
})
