import { join } from '@tauri-apps/api/path'
import type { DirEntry } from '@tauri-apps/plugin-fs'
import { describe, expect, it, vi } from 'vitest'

import {
  collectSiblingNoteNames,
  ensureUniqueNoteName,
  extractAndSanitizeName,
  extractName,
  sanitizeFileName,
  stripExtension,
} from './ai-rename-utils'

const WINDOWS_DRIVE_LETTER_REGEX = /^[A-Za-z]:/

vi.mock('@tauri-apps/api/path', () => ({
  join: vi.fn(async (...parts: string[]) => {
    // Detect if any part is a Windows path (starts with drive letter like C:, D:, etc.)
    const isWindowsPath = parts.some((part) =>
      WINDOWS_DRIVE_LETTER_REGEX.test(part)
    )
    const separator = isWindowsPath ? '\\' : '/'
    return parts.join(separator)
  }),
}))

const makeEntry = (name: string, overrides?: Partial<DirEntry>): DirEntry => ({
  name,
  isDirectory: false,
  isFile: true,
  isSymlink: false,
  ...overrides,
})

describe('collectSiblingNoteNames', () => {
  it('filters out non-markdown, hidden, and current entries', () => {
    const entries: DirEntry[] = [
      makeEntry('current.md'),
      makeEntry('.hidden.md'),
      makeEntry('note-one.md'),
      makeEntry('picture.png'),
      makeEntry('Second.MD'),
      makeEntry('Folder', { isDirectory: true, isFile: false }),
    ]

    const result = collectSiblingNoteNames(entries, 'current.md')

    expect(result).toEqual(['note-one', 'Second'])
  })

  it('limits to the first ten markdown siblings', () => {
    const entries = Array.from({ length: 12 }, (_, index) =>
      makeEntry(`Note ${index}.md`)
    )

    const result = collectSiblingNoteNames(entries, 'another.md')

    expect(result).toHaveLength(10)
    expect(result[0]).toBe('Note 0')
    expect(result[9]).toBe('Note 9')
  })
})

describe('extractName', () => {
  it('uses the first line and strips problematic characters', () => {
    const raw = ' "Ideas <Draft>"\nSecond line that should be ignored'

    expect(extractName(raw)).toBe('Ideas  Draft')
  })
})

describe('sanitizeFileName', () => {
  it('removes markdown extensions, invalid characters, trailing dots, and extra whitespace', () => {
    expect(sanitizeFileName('  invalid:name?.md')).toBe('invalid name')
    expect(sanitizeFileName(' dotted title...')).toBe('dotted title')
  })

  it('truncates long names to sixty characters', () => {
    const longName = `${'a'.repeat(70)}.md`
    const result = sanitizeFileName(longName)

    expect(result.length).toBe(60)
    expect(result).toBe('a'.repeat(60))
  })
})

describe('extractAndSanitizeName', () => {
  it('extracts the first line and sanitizes the name', () => {
    const raw = ' "First Idea?.md"\nAnother suggestion'

    expect(extractAndSanitizeName(raw)).toBe('First Idea')
  })
})

describe('stripExtension', () => {
  it('removes the specified extension case-insensitively', () => {
    expect(stripExtension('Note.MD', '.md')).toBe('Note')
  })

  it('returns the original name when the extension does not match', () => {
    expect(stripExtension('diagram.png', '.md')).toBe('diagram.png')
  })
})

describe('ensureUniqueNoteName', () => {
  it.each([
    {
      name: 'Unix paths',
      directoryPath: '/notes',
      currentPath: '/notes/Note.md',
      expectedFullPath: '/notes/Note.md',
    },
    {
      name: 'Windows paths',
      directoryPath: 'C:\\notes',
      currentPath: 'C:\\notes\\Note.md',
      expectedFullPath: 'C:\\notes\\Note.md',
    },
  ])(
    'returns the current path when the candidate matches it ($name)',
    async ({ directoryPath, currentPath, expectedFullPath }) => {
      const exists = vi.fn()

      const result = await ensureUniqueNoteName(
        directoryPath,
        'Note',
        currentPath,
        exists
      )

      expect(result).toEqual({
        fileName: 'Note.md',
        fullPath: expectedFullPath,
      })
      expect(exists).not.toHaveBeenCalled()
    }
  )

  it.each([
    {
      name: 'Unix paths',
      directoryPath: '/notes',
      currentPath: '/notes/Other.md',
      reserved: new Set(['/notes/Note.md', '/notes/Note 1.md']),
      expectedFullPath: '/notes/Note 2.md',
      expectedExistsCall: '/notes/Note 1.md',
    },
    {
      name: 'Windows paths',
      directoryPath: 'C:\\notes',
      currentPath: 'C:\\notes\\Other.md',
      reserved: new Set(['C:\\notes\\Note.md', 'C:\\notes\\Note 1.md']),
      expectedFullPath: 'C:\\notes\\Note 2.md',
      expectedExistsCall: 'C:\\notes\\Note 1.md',
    },
  ])(
    'iterates suffixes until it finds an available name ($name)',
    async ({
      directoryPath,
      currentPath,
      reserved,
      expectedFullPath,
      expectedExistsCall,
    }) => {
      const exists = vi.fn(async (path: string) => reserved.has(path))

      const result = await ensureUniqueNoteName(
        directoryPath,
        'Note',
        currentPath,
        exists
      )

      expect(result).toEqual({
        fileName: 'Note 2.md',
        fullPath: expectedFullPath,
      })
      expect(exists).toHaveBeenCalledTimes(3)
      expect(exists).toHaveBeenCalledWith(expectedExistsCall)
    }
  )

  it.each([
    {
      name: 'Unix paths',
      directoryPath: '/notes',
      currentPath: '/notes/current.md',
    },
    {
      name: 'Windows paths',
      directoryPath: 'C:\\notes',
      currentPath: 'C:\\notes\\current.md',
    },
  ])(
    'throws after exhausting attempts ($name)',
    async ({ directoryPath, currentPath }) => {
      const exists = vi.fn(async () => true)

      await expect(
        ensureUniqueNoteName(directoryPath, 'Note', currentPath, exists)
      ).rejects.toThrowError('Unable to find a unique filename.')

      expect(exists).toHaveBeenCalledTimes(100)
      expect(vi.mocked(join)).toHaveBeenCalled()
    }
  )
})
