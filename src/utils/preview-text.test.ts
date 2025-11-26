import { describe, expect, it } from 'vitest'
import { formatPreviewText } from './preview-text'

describe('formatPreviewText', () => {
  it('strips heading hashes and appends next line as body', () => {
    const raw = '#   Hello World  \nBody text'
    expect(formatPreviewText(raw)).toBe('Hello World Body text')
  })

  it('uses first meaningful line and appends following heading', () => {
    const raw = '   Plain title with leading spaces   \n# Another heading'
    expect(formatPreviewText(raw)).toBe(
      'Plain title with leading spaces Another heading'
    )
  })

  it('removes inline markdown while keeping text', () => {
    const raw = '**bold** _italic_ ~~strike~~ `code`'
    expect(formatPreviewText(raw)).toBe('bold italic strike code')
  })

  it('keeps link text and drops wrappers', () => {
    const raw = '[Click here](https://example.com) plus [Ref][id]'
    expect(formatPreviewText(raw)).toBe('Click here plus Ref')
  })

  it('skips blocks (code, quotes, images, tables, html) and cleans inline', () => {
    const raw = [
      '![img](img.png)',
      '> quoted',
      '```',
      'code line',
      '```',
      '<table>',
      '<tr><td>cell</td></tr>',
      '</table>',
      '| h | h |',
      '| --- | --- |',
      'Final line with [link](https://example.com) and ~~strike~~',
    ].join('\n')

    expect(formatPreviewText(raw)).toBe('Final line with link and strike')
  })

  it('handles setext underline by keeping the title line', () => {
    const raw = ['Title Line', '=====', 'Body'].join('\n')
    expect(formatPreviewText(raw)).toBe('Title Line Body')
  })

  it('unescapes escaped punctuation like numbered lists', () => {
    const raw = ['---', '1. abc', '---', '1\\.'].join('\n')
    expect(formatPreviewText(raw)).toBe('1. abc 1.')
  })
})
