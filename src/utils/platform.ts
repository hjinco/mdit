import { platform } from '@tauri-apps/plugin-os'

let cachedPlatform: string | null = null

/**
 * Returns the platform string ('macos', 'windows', 'linux').
 * The result is cached after the first call.
 *
 * @returns the platform string
 */
export function getPlatform() {
  if (cachedPlatform === null) {
    cachedPlatform = platform()
  }
  return cachedPlatform
}

/**
 * Returns true if running on macOS.
 *
 * @returns true if macOS, false otherwise
 */
export function isMac(): boolean {
  const plat = getPlatform()
  return plat === 'macos'
}

/**
 * Returns true if running on Windows.
 *
 * @returns true if Windows, false otherwise
 */
export function isWindows(): boolean {
  const plat = getPlatform()
  return plat === 'windows'
}

/**
 * Returns true if running on Linux.
 *
 * @returns true if Linux, false otherwise
 */
export function isLinux(): boolean {
  const plat = getPlatform()
  return plat === 'linux'
}
