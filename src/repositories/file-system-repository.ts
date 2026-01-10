import { invoke } from '@tauri-apps/api/core'
import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  rename,
  stat,
  writeTextFile,
} from '@tauri-apps/plugin-fs'

export type { DirEntry, FileInfo } from '@tauri-apps/plugin-fs'

export class FileSystemRepository {
  exists(path: string): Promise<boolean> {
    return exists(path)
  }

  mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    return mkdir(path, options)
  }

  readDir(path: string) {
    return readDir(path)
  }

  readTextFile(path: string): Promise<string> {
    return readTextFile(path)
  }

  rename(sourcePath: string, destinationPath: string): Promise<void> {
    return rename(sourcePath, destinationPath)
  }

  stat(path: string) {
    return stat(path)
  }

  writeTextFile(path: string, contents: string): Promise<void> {
    return writeTextFile(path, contents)
  }

  moveToTrash(path: string): Promise<void> {
    return invoke<void>('move_to_trash', { path })
  }

  moveManyToTrash(paths: string[]): Promise<void> {
    return invoke<void>('move_many_to_trash', { paths })
  }

  copy(sourcePath: string, destinationPath: string): Promise<void> {
    return invoke<void>('copy', { sourcePath, destinationPath })
  }

  async isExistingDirectory(path: string): Promise<boolean> {
    try {
      const statResult = await this.stat(path)
      return statResult.isDirectory
    } catch {
      return false
    }
  }
}
