import { join } from '@tauri-apps/api/path'
import { exists, readDir } from '@tauri-apps/plugin-fs'

const TEMPLATES_DIR = 'templates'
const MD_EXTENSION_REGEX = /\.md$/i

export async function getTemplateFiles(
  workspacePath: string | null
): Promise<Array<{ name: string; path: string }>> {
  if (!workspacePath) {
    return []
  }

  try {
    const templatesDir = await join(workspacePath, '.mdit', TEMPLATES_DIR)

    if (!(await exists(templatesDir))) {
      return []
    }

    const entries = await readDir(templatesDir)
    const templateFilesPromises = entries
      .filter((entry) => !entry.isDirectory && entry.name.endsWith('.md'))
      .map(async (entry) => ({
        name: entry.name.replace(MD_EXTENSION_REGEX, ''),
        path: await join(templatesDir, entry.name),
      }))

    const templateFiles = await Promise.all(templateFilesPromises)

    return templateFiles.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Failed to read template files:', error)
    return []
  }
}
