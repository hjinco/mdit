import { describe, expect, it } from 'vitest'

import { rewriteMarkdownRelativeLinks } from './markdown-link-utils'

describe('rewriteMarkdownRelativeLinks', () => {
  it('rewrites inline relative links when a file moves between sibling directories', () => {
    const content = 'Install [guide](./assets/setup.md) now.'
    const result = rewriteMarkdownRelativeLinks(
      content,
      '/repo/docs/guides/getting-started',
      '/repo/docs/guides/advanced'
    )

    expect(result).toBe(
      'Install [guide](../getting-started/assets/setup.md) now.'
    )
  })

  it('rewrites reference definitions and keeps suffixes intact', () => {
    const content = [
      'See [reference][guide].',
      '',
      '[guide]: ./reference.md?view=full#intro "Guide reference"',
    ].join('\n')

    const result = rewriteMarkdownRelativeLinks(
      content,
      '/repo/docs/guides/section-a',
      '/repo/docs/guides/section-b'
    )

    expect(result).toBe(
      [
        'See [reference][guide].',
        '',
        '[guide]: ../section-a/reference.md?view=full#intro "Guide reference"',
      ].join('\n')
    )
  })

  it('rewrites inline images while preserving escaped characters and titles', () => {
    const content = '![diagram](./figures/image\\(final\\).png "Flow diagram")'

    const result = rewriteMarkdownRelativeLinks(
      content,
      '/repo/docs/chapter-one',
      '/repo/docs/chapter-two'
    )

    expect(result).toBe(
      '![diagram](../chapter-one/figures/image\\(final\\).png "Flow diagram")'
    )
  })

  it('preserves angle brackets for destinations that contain spaces', () => {
    const content =
      'Review [diagram](<./assets/final diagram.png>) before continuing.'

    const result = rewriteMarkdownRelativeLinks(
      content,
      '/repo/docs/section-one',
      '/repo/docs/section-two'
    )

    expect(result).toBe(
      'Review [diagram](<../section-one/assets/final diagram.png>) before continuing.'
    )
  })

  it('keeps Windows style separators when the original destination used backslashes', () => {
    const content = 'Compare [notes](.\\notes\\intro.md) later.'

    const result = rewriteMarkdownRelativeLinks(
      content,
      'C:/repo/docs/chapter-one',
      'C:/repo/docs/chapter-two'
    )

    expect(result).toBe(
      'Compare [notes](..\\chapter-one\\notes\\intro.md) later.'
    )
  })

  it('ignores destinations that are already absolute, anchors, or protocol relative', () => {
    const content =
      'External [site](https://example.com) and [anchor](#intro) plus [root](/assets/logo.png) and [proto](//cdn.example.com/file.js).'

    const result = rewriteMarkdownRelativeLinks(
      content,
      '/repo/docs/one',
      '/repo/docs/two'
    )

    expect(result).toBe(content)
  })

  it('leaves links untouched when their relative destinations remain valid after moving', () => {
    const content = 'Shared [diagram](../shared/diagram.png) reference.'

    const result = rewriteMarkdownRelativeLinks(
      content,
      '/repo/docs/one',
      '/repo/docs/two'
    )

    expect(result).toBe(content)
  })
})
