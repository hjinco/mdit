import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  writeTextFile,
} from '@tauri-apps/plugin-fs'
import { join } from 'pathe'
import { getFileNameFromPath } from '@/utils/path-utils'

const TEMPLATES_DIR = 'templates'
const MD_EXTENSION_REGEX = /\.md$/i

export async function getTemplateFiles(
  workspacePath: string | null
): Promise<Array<{ name: string; path: string }>> {
  if (!workspacePath) {
    return []
  }

  try {
    const templatesDir = join(workspacePath, '.mdit', TEMPLATES_DIR)

    if (!(await exists(templatesDir))) {
      return []
    }

    const entries = await readDir(templatesDir)
    const templateFiles = entries
      .filter(
        (entry) => !entry.isDirectory && MD_EXTENSION_REGEX.test(entry.name)
      )
      .map((entry) => ({
        name: entry.name.replace(MD_EXTENSION_REGEX, ''),
        path: join(templatesDir, entry.name),
      }))

    return templateFiles.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Failed to read template files:', error)
    return []
  }
}

export async function saveNoteAsTemplate(
  workspacePath: string,
  notePath: string
): Promise<void> {
  if (!workspacePath) {
    throw new Error('Workspace path is not set')
  }

  try {
    // Read note content
    const noteContent = await readTextFile(notePath)

    // Ensure templates directory exists
    const templatesDir = join(workspacePath, '.mdit', TEMPLATES_DIR)
    if (!(await exists(templatesDir))) {
      await mkdir(templatesDir, { recursive: true })
    }

    // Extract note filename (with .md extension)
    const templateFileName = getFileNameFromPath(notePath)
    const templateFilePath = join(templatesDir, templateFileName)

    // Check if template file already exists
    if (await exists(templateFilePath)) {
      const noteName = templateFileName.replace(MD_EXTENSION_REGEX, '')
      throw new Error(`Template "${noteName}" already exists`)
    }

    // Write template file
    await writeTextFile(templateFilePath, noteContent)
  } catch (error) {
    console.error('Failed to save note as template:', error)
    throw error
  }
}
