import { stat } from '@tauri-apps/plugin-fs'

export async function isExistingDirectory(path: string): Promise<boolean> {
  try {
    const statResult = await stat(path)
    return statResult.isDirectory
  } catch {
    return false
  }
}
