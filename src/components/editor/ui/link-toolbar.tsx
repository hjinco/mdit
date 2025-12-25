import { flip, offset, type UseVirtualFloatingOptions } from '@platejs/floating'
import { upsertLink } from '@platejs/link'
import {
  type LinkFloatingToolbarState,
  LinkPlugin,
  useFloatingLinkEdit,
  useFloatingLinkEditState,
  useFloatingLinkInsert,
  useFloatingLinkInsertState,
  useFloatingLinkUrlInputState,
} from '@platejs/link/react'
import { join, dirname as tauriDirname } from '@tauri-apps/api/path'
import { openUrl } from '@tauri-apps/plugin-opener'
import { cva } from 'class-variance-authority'
import {
  Check,
  ExternalLink,
  FileIcon,
  GlobeIcon,
  Link,
  Unlink,
} from 'lucide-react'
import { dirname as pathDirname, relative } from 'pathe'
import type { TLinkElement } from 'platejs'
import { KEYS } from 'platejs'
import {
  useEditorPlugin,
  useEditorRef,
  useEditorSelection,
  useFormInputProps,
  usePluginOption,
} from 'platejs/react'
import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react'
import { cn } from '@/lib/utils'
import { useTabStore } from '@/store/tab-store'
import type { WorkspaceEntry } from '@/store/workspace-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { buttonVariants } from '@/ui/button'
import { Separator } from '@/ui/separator'

const popoverVariants = cva(
  'z-50 w-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-hidden'
)

export function LinkFloatingToolbar({
  state,
}: {
  state?: LinkFloatingToolbarState
}) {
  const activeCommentId = usePluginOption({ key: KEYS.comment }, 'activeId')
  const activeSuggestionId = usePluginOption(
    { key: KEYS.suggestion },
    'activeId'
  )

  const floatingOptions: UseVirtualFloatingOptions = useMemo(() => {
    return {
      middleware: [
        offset(8),
        flip({
          fallbackPlacements: ['bottom-end', 'top-start', 'top-end'],
          padding: 12,
        }),
      ],
      placement:
        activeSuggestionId || activeCommentId ? 'top-start' : 'bottom-start',
    }
  }, [activeCommentId, activeSuggestionId])

  const insertState = useFloatingLinkInsertState({
    ...state,
    floatingOptions: {
      ...floatingOptions,
      ...state?.floatingOptions,
    },
  })
  const {
    hidden,
    props: insertProps,
    ref: insertRef,
  } = useFloatingLinkInsert(insertState)

  const editState = useFloatingLinkEditState({
    ...state,
    floatingOptions: {
      ...floatingOptions,
      ...state?.floatingOptions,
    },
  })
  const {
    editButtonProps,
    props: editProps,
    ref: editRef,
    unlinkButtonProps,
  } = useFloatingLinkEdit(editState)
  const inputProps = useFormInputProps({
    preventDefaultOnEnterKeydown: true,
  })

  if (hidden) return null

  const input = (
    <div className="flex min-w-[330px] flex-col" {...inputProps}>
      <LinkUrlInput />
    </div>
  )

  const editContent = editState.isEditing ? (
    input
  ) : (
    <div className="box-content flex items-center">
      <button
        className={buttonVariants({ size: 'sm', variant: 'ghost' })}
        type="button"
        {...editButtonProps}
      >
        Edit link
      </button>

      <Separator orientation="vertical" />

      <LinkOpenButton />

      <Separator orientation="vertical" />

      <button
        className={buttonVariants({
          size: 'icon',
          variant: 'ghost',
        })}
        type="button"
        {...unlinkButtonProps}
      >
        <Unlink width={18} />
      </button>
    </div>
  )

  return (
    <>
      <div ref={insertRef} className={popoverVariants()} {...insertProps}>
        {input}
      </div>

      <div ref={editRef} className={popoverVariants()} {...editProps}>
        {editContent}
      </div>
    </>
  )
}

type WorkspaceFileOption = {
  absolutePath: string
  displayName: string
  relativePath: string
  relativePathLower: string
}

const backslashRegex = /\\/g
const multipleSlashesRegex = /\/{2,}/g
const trailingSlashesRegex = /\/+$/

function LinkUrlInput() {
  const { ref } = useFloatingLinkUrlInputState()
  const editor = useEditorRef()
  const { api, setOption } = useEditorPlugin(LinkPlugin)

  const workspaceEntries = useWorkspaceStore((state) => state.entries)
  const workspacePath = useWorkspaceStore((state) => state.workspacePath)
  const currentTabPath = useTabStore((state) => state.tab?.path ?? null)

  const suggestionsSource = useMemo(
    () => flattenWorkspaceFiles(workspaceEntries, workspacePath),
    [workspaceEntries, workspacePath]
  )

  const encodedUrl = usePluginOption(LinkPlugin, 'url') as string | undefined
  const decodedUrl = useMemo(
    () => (encodedUrl ? safelyDecodeUrl(encodedUrl) : ''),
    [encodedUrl]
  )

  const [value, setValue] = useState(decodedUrl)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const listboxId = useId()

  const trimmedValue = useMemo(() => value.trim(), [value])

  const applyUrlToEditor = useCallback(
    (rawUrl: string) => {
      const encoded = ensureUriEncoding(rawUrl)
      setOption('url', encoded)
      return encoded
    },
    [setOption]
  )

  // Sync input value with external URL changes, but prevent unnecessary re-renders
  // by only updating when the value actually changes
  useEffect(() => {
    setValue((previous) => (previous === decodedUrl ? previous : decodedUrl))
  }, [decodedUrl])

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation()
    const nextValue = event.target.value
    setValue(nextValue)
    setHighlightedIndex(-1)
  }, [])

  const isHttpLink = startsWithHttpProtocol(value)

  const suggestionsEnabled = !isHttpLink

  const { hasExactMatch, suggestions: filteredSuggestions } = useMemo(() => {
    if (!suggestionsEnabled) {
      return { hasExactMatch: false, suggestions: [] as WorkspaceFileOption[] }
    }

    if (!trimmedValue) {
      return {
        hasExactMatch: false,
        suggestions: [] as WorkspaceFileOption[],
      }
    }

    const normalizedQuery = normalizePathSeparators(trimmedValue)
    const normalizedLowerQuery = normalizedQuery.toLowerCase()
    const pathQueryCandidates = createPathQueryCandidates(normalizedLowerQuery)
    const exactQueryCandidates = new Set(pathQueryCandidates)
    const displayNameQuery = stripCurrentDirectoryPrefix(
      stripLeadingSlashes(normalizedLowerQuery)
    )
    const tabDirectory = currentTabPath ? pathDirname(currentTabPath) : null

    let exactMatchFound = false

    const suggestions = suggestionsSource.filter((file) => {
      const matchesRelativePath = pathQueryCandidates.some((candidate) =>
        file.relativePathLower.includes(candidate)
      )

      if (
        !exactMatchFound &&
        exactQueryCandidates.has(file.relativePathLower)
      ) {
        exactMatchFound = true
      }

      if (matchesRelativePath) {
        return true
      }

      if (
        displayNameQuery &&
        file.displayName.toLowerCase().includes(displayNameQuery)
      ) {
        return true
      }

      if (tabDirectory) {
        const relativeToTabLower = normalizePathSeparators(
          relative(tabDirectory, file.absolutePath)
        ).toLowerCase()

        if (!exactMatchFound && exactQueryCandidates.has(relativeToTabLower)) {
          exactMatchFound = true
        }

        if (
          pathQueryCandidates.some((candidate) =>
            relativeToTabLower.includes(candidate)
          )
        ) {
          return true
        }
      }

      return false
    })

    return { hasExactMatch: exactMatchFound, suggestions }
  }, [suggestionsEnabled, suggestionsSource, trimmedValue, currentTabPath])

  useEffect(() => {
    setHighlightedIndex((previous) => {
      if (previous < 0) {
        return -1
      }

      if (previous >= filteredSuggestions.length) {
        return filteredSuggestions.length ? filteredSuggestions.length - 1 : -1
      }

      return previous
    })
  }, [filteredSuggestions])

  useEffect(() => {
    if (highlightedIndex < 0) {
      return
    }

    const highlightedElement = document.getElementById(
      `${listboxId}-${highlightedIndex}`
    )
    if (highlightedElement) {
      highlightedElement.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      })
    }
  }, [highlightedIndex, listboxId])

  const handleSelectSuggestion = useCallback(
    (file: WorkspaceFileOption) => {
      if (!currentTabPath) {
        return
      }

      const tabDirectory = pathDirname(currentTabPath)
      const relativePath = relative(tabDirectory, file.absolutePath)

      const normalizedRelativePath = normalizePathSeparators(relativePath)
      const nextValue =
        normalizedRelativePath &&
        !normalizedRelativePath.startsWith('.') &&
        !normalizedRelativePath.startsWith('/')
          ? `./${normalizedRelativePath}`
          : normalizedRelativePath

      setValue(nextValue)
      applyUrlToEditor(nextValue)
      setHighlightedIndex(-1)

      requestAnimationFrame(() => {
        ref.current?.focus()
      })
    },
    [applyUrlToEditor, currentTabPath, ref]
  )

  const handleBlur = useCallback(() => {
    requestAnimationFrame(() => {
      setHighlightedIndex(-1)
    })
  }, [])

  const hasQuery = Boolean(trimmedValue)

  const showSuggestionList =
    hasQuery &&
    suggestionsEnabled &&
    !hasExactMatch &&
    filteredSuggestions.length > 0
  const showEmptyState =
    hasQuery &&
    suggestionsEnabled &&
    !hasExactMatch &&
    filteredSuggestions.length === 0

  const confirmLink = useCallback(() => {
    if (!trimmedValue) {
      requestAnimationFrame(() => {
        ref.current?.focus()
      })
      return
    }

    applyUrlToEditor(trimmedValue)

    const didSubmit = upsertLink(editor, {
      url: trimmedValue,
      skipValidation: true,
    })
    if (didSubmit) {
      setHighlightedIndex(-1)
      api.floatingLink.hide()
      editor.tf.focus()
      return
    }

    requestAnimationFrame(() => {
      ref.current?.focus()
    })
  }, [api, applyUrlToEditor, editor, ref, trimmedValue])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      const { key } = event

      if (key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        event.nativeEvent.stopImmediatePropagation?.()

        if (filteredSuggestions.length && highlightedIndex >= 0) {
          const option = filteredSuggestions[highlightedIndex]
          if (option) {
            handleSelectSuggestion(option)
          }
          return
        }

        confirmLink()
        return
      }

      event.stopPropagation()
      event.nativeEvent.stopImmediatePropagation?.()

      if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === 'a') {
        event.preventDefault()
        event.currentTarget.select()
        return
      }

      if (key === 'Escape') {
        event.preventDefault()
        api.floatingLink.hide()
        editor.tf.focus()
        return
      }

      if (!filteredSuggestions.length) {
        return
      }

      if (key === 'ArrowDown') {
        event.preventDefault()
        setHighlightedIndex((previous) => {
          const next = previous + 1
          if (next < 0) return 0
          return next >= filteredSuggestions.length
            ? filteredSuggestions.length - 1
            : next
        })
        return
      }

      if (key === 'ArrowUp') {
        event.preventDefault()
        setHighlightedIndex((previous) => {
          if (previous <= 0) {
            return -1
          }
          return previous - 1
        })
        return
      }
    },
    [
      confirmLink,
      filteredSuggestions,
      handleSelectSuggestion,
      highlightedIndex,
      api,
      editor,
    ]
  )

  const handleConfirm = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      event.nativeEvent.stopImmediatePropagation?.()

      confirmLink()
    },
    [confirmLink]
  )

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center">
        <div className="flex items-center pr-1 pl-2 text-muted-foreground">
          <LinkIcon value={value} />
        </div>

        <div className="flex-1">
          <input
            ref={ref}
            className="flex h-[28px] w-full rounded-md border-none bg-transparent px-1.5 py-1 text-base placeholder:text-muted-foreground focus-visible:ring-transparent focus-visible:outline-none md:text-sm"
            placeholder="Paste link"
            value={value}
            data-plate-focus
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded={showSuggestionList || showEmptyState}
            aria-controls={showSuggestionList ? listboxId : undefined}
            aria-activedescendant={
              showSuggestionList && highlightedIndex >= 0
                ? `${listboxId}-${highlightedIndex}`
                : undefined
            }
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <button
          type="button"
          className={`${buttonVariants({ size: 'icon', variant: 'ghost' })} ml-1 flex-shrink-0 text-muted-foreground`}
          aria-label="Apply link"
          title="Apply link"
          onClick={handleConfirm}
          onMouseDown={(event) => {
            event.stopPropagation()
          }}
          disabled={!trimmedValue}
        >
          <Check className="size-4" />
        </button>
      </div>

      {(showSuggestionList || showEmptyState) && (
        <div className="mt-2">
          <div
            onMouseLeave={() => {
              setHighlightedIndex(-1)
            }}
          >
            <div
              id={listboxId}
              role="listbox"
              className="max-h-[300px] scroll-py-1 overflow-y-auto"
            >
              {showEmptyState ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  No matching notes
                </div>
              ) : (
                <div className="space-y-0.5 text-foreground">
                  {filteredSuggestions.map((file, index) => {
                    const isHighlighted = index === highlightedIndex
                    return (
                      <div
                        key={file.absolutePath}
                        id={`${listboxId}-${index}`}
                        data-selected={isHighlighted}
                        className={cn(
                          'relative flex cursor-default select-none flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-sm outline-hidden',
                          'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
                          isHighlighted
                            ? 'bg-accent text-accent-foreground'
                            : 'text-foreground'
                        )}
                        // Prevent mousedown from stealing focus from the input field
                        onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
                          event.preventDefault()
                        }}
                        onMouseEnter={() => {
                          setHighlightedIndex(index)
                        }}
                        onClick={() => handleSelectSuggestion(file)}
                      >
                        <span className="text-sm font-medium whitespace-nowrap">
                          {file.displayName}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {file.relativePath}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LinkIcon({ value }: { value: string }) {
  const trimmed = value.trim()

  if (startsWithHttpProtocol(trimmed)) {
    return <GlobeIcon className="size-4" />
  }

  if (trimmed.length > 0) {
    return <FileIcon className="size-4" />
  }

  return <Link className="size-4" />
}

function LinkOpenButton() {
  const editor = useEditorRef()
  const selection = useEditorSelection()
  const workspacePath = useWorkspaceStore((state) => state.workspacePath)
  const openTab = useTabStore((state) => state.openTab)
  const currentTab = useTabStore((state) => state.tab)

  // biome-ignore lint/correctness/useExhaustiveDependencies: get element when the selection changes
  const { element } = useMemo(() => {
    const entry = editor.api.node<TLinkElement>({
      match: { type: editor.getType(KEYS.link) },
    })

    if (!entry) {
      return { element: null as TLinkElement | null }
    }

    const [node] = entry

    return {
      element: node,
    }
  }, [selection])

  const href = element?.url ?? ''
  const decodedUrl = href ? safelyDecodeUrl(href) : ''
  const isWebLink = startsWithHttpProtocol(decodedUrl)

  const handleOpen = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()

      const fallbackHref = element?.url ?? ''
      const targetUrl = decodedUrl || fallbackHref
      if (!targetUrl) {
        return
      }

      if (!isWebLink) {
        if (targetUrl.startsWith('#')) {
          // TODO: handle anchor links
          return
        }

        try {
          if (!workspacePath) {
            return
          }

          let absolutePath: string | null = null

          if (targetUrl.startsWith('/')) {
            const workspaceRelativePath = stripLeadingSlashes(targetUrl)
            absolutePath = await join(workspacePath, workspaceRelativePath)
          } else {
            const currentPath = currentTab?.path
            if (!currentPath) {
              return
            }

            const currentDirectory = await tauriDirname(currentPath)
            absolutePath = await join(currentDirectory, targetUrl)
          }

          if (!absolutePath) {
            return
          }

          const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspacePath)
          if (!normalizedWorkspaceRoot) {
            console.warn('Workspace root missing; link open aborted')
            return
          }

          const normalizedAbsolute = normalizePathSeparators(absolutePath)

          if (
            normalizedAbsolute !== normalizedWorkspaceRoot &&
            !normalizedAbsolute.startsWith(`${normalizedWorkspaceRoot}/`)
          ) {
            console.warn(
              'Workspace link outside of root blocked:',
              normalizedAbsolute
            )
            return
          }

          await openTab(absolutePath)
        } catch (error) {
          console.error('Failed to open workspace link:', error)
        }

        return
      }

      try {
        await openUrl(targetUrl)
      } catch (error) {
        console.error('Failed to open external link:', error)
      }
    },
    [
      currentTab?.path,
      decodedUrl,
      element?.url,
      isWebLink,
      openTab,
      workspacePath,
    ]
  )

  return (
    <button
      type="button"
      className={buttonVariants({
        size: 'sm',
        variant: 'ghost',
      })}
      onMouseOver={(event) => {
        event.stopPropagation()
      }}
      onFocus={() => {
        return
      }}
      onClick={handleOpen}
    >
      <ExternalLink width={18} />
    </button>
  )
}

// Recursively traverse workspace file tree and collect all .md files for autocomplete
// Returns flattened list with relative paths for suggestion matching
function flattenWorkspaceFiles(
  entries: WorkspaceEntry[],
  workspacePath: string | null
): WorkspaceFileOption[] {
  if (!workspacePath) {
    return []
  }

  const normalizedRoot = normalizeWorkspaceRoot(workspacePath)
  const files: WorkspaceFileOption[] = []

  const visit = (nodes: WorkspaceEntry[]) => {
    for (const node of nodes) {
      if (node.isDirectory) {
        if (node.children) {
          visit(node.children)
        }
        continue
      }

      // Only include .md files for linking
      if (!node.name.toLowerCase().endsWith('.md')) {
        continue
      }

      const normalizedAbsolute = normalizePathSeparators(node.path)
      let relativePath = ''

      // Calculate path relative to workspace root by stripping the root prefix
      if (normalizedAbsolute.startsWith(`${normalizedRoot}/`)) {
        relativePath = normalizedAbsolute.slice(normalizedRoot.length + 1)
      } else if (normalizedAbsolute.startsWith(normalizedRoot)) {
        relativePath = normalizedAbsolute.slice(normalizedRoot.length)
      }

      relativePath = stripLeadingSlashes(relativePath)
      if (!relativePath) {
        relativePath = node.name
      }

      const normalizedRelative = normalizePathSeparators(relativePath)

      files.push({
        absolutePath: node.path,
        displayName: node.name,
        relativePath: normalizedRelative,
        relativePathLower: normalizedRelative.toLowerCase(),
      })
    }
  }

  visit(entries)

  files.sort((a, b) => a.relativePathLower.localeCompare(b.relativePathLower))

  return files
}

// Convert all path separators to forward slashes and remove duplicates/trailing slashes
// Ensures consistent path format across different operating systems
function createPathQueryCandidates(normalizedLowerQuery: string): string[] {
  if (!normalizedLowerQuery) {
    return []
  }

  const candidates = new Set<string>([normalizedLowerQuery])

  const withoutCurrentDir = stripCurrentDirectoryPrefix(normalizedLowerQuery)
  candidates.add(withoutCurrentDir)

  const withoutLeadingSlashes = stripLeadingSlashes(normalizedLowerQuery)
  candidates.add(withoutLeadingSlashes)

  const withoutBoth = stripCurrentDirectoryPrefix(withoutLeadingSlashes)
  candidates.add(withoutBoth)

  return Array.from(candidates).filter(Boolean)
}

function stripCurrentDirectoryPrefix(value: string): string {
  let result = value
  while (result.startsWith('./')) {
    result = result.slice(2)
  }
  return result
}

function normalizePathSeparators(path: string): string {
  const withForwardSlashes = path.replace(backslashRegex, '/')
  const collapsed = withForwardSlashes.replace(multipleSlashesRegex, '/')
  if (collapsed.length <= 1) {
    return collapsed
  }
  return collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed
}

function normalizeWorkspaceRoot(workspacePath: string): string {
  if (!workspacePath) {
    return ''
  }
  const normalized = normalizePathSeparators(workspacePath)
  return normalized.replace(trailingSlashesRegex, '')
}

function stripLeadingSlashes(value: string): string {
  let index = 0
  while (
    index < value.length &&
    (value[index] === '/' || value[index] === '\\')
  ) {
    index += 1
  }
  return value.slice(index)
}

// Store URLs percent-encoded so markdown serialization keeps spaces & Unicode stable
// while avoiding double-encoding if segments are already escaped.
function ensureUriEncoding(url: string): string {
  try {
    const isEncoded = url !== decodeURIComponent(url)
    return isEncoded ? url : encodeURI(url)
  } catch (error) {
    if (error instanceof URIError) {
      return url
    }
    throw error
  }
}

function safelyDecodeUrl(url: string): string {
  try {
    return decodeURI(url)
  } catch (error) {
    if (error instanceof URIError) {
      return url
    }
    throw error
  }
}

function startsWithHttpProtocol(value: string): boolean {
  const lower = value.trim().toLowerCase()
  return lower.startsWith('http://') || lower.startsWith('https://')
}
