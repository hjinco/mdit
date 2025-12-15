import { platform, version } from '@tauri-apps/plugin-os'

let cachedPlatform: string | null = null

// Regex for Windows version parsing: "10.0.buildNumber"
const WINDOWS_VERSION_REGEX = /^10\.0\.(\d+)/

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

/**
 * Returns true if running on Windows 10 or below (Windows 7, 8, 8.1, 10).
 * Windows 10 has version "10.0" and build number < 22000.
 * Windows 11 has build number >= 22000.
 * Windows 7/8/8.1 have version "6.x" (e.g., "6.1", "6.2", "6.3").
 * Windows XP/Vista have version "5.x" (e.g., "5.1", "5.2").
 *
 * @returns Promise that resolves to true if Windows 10 or below, false otherwise
 */
export async function isWindows10(): Promise<boolean> {
  if (!isWindows()) {
    return false
  }

  try {
    const osVersion = version()

    // Windows 10/11 (10.0.x) - check build number
    if (osVersion.startsWith('10.0')) {
      const versionMatch = osVersion.match(WINDOWS_VERSION_REGEX)
      // Windows 10: build < 22000, Windows 11: build >= 22000
      return versionMatch ? Number.parseInt(versionMatch[1], 10) < 22_000 : true
    }

    // All other Windows versions (5.x, 6.x, etc.) are below Windows 10
    return true
  } catch {
    return false
  }
}
