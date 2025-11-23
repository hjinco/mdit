import { isMac } from './platform'

/**
 * Returns the platform-appropriate modifier key symbol for keyboard shortcuts.
 * - Returns "⌘" on macOS
 * - Returns "Ctrl" on Windows/Linux
 *
 * @returns The modifier key symbol as a string
 *
 * @example
 * getModifierKey() // "⌘" on macOS, "Ctrl" on Windows/Linux
 */
export function getModifierKey(): string {
  return isMac() ? '⌘' : 'Ctrl'
}

