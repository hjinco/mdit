import { generateText } from 'ai'
import { toast } from 'sonner'
import { FileSystemRepository } from '@/repositories/file-system-repository'
import {
  removeFileFrontmatterProperty,
  renameFileFrontmatterProperty,
  updateFileFrontmatter,
} from '@/utils/frontmatter-utils'
import {
  AI_RENAME_SYSTEM_PROMPT,
  buildRenamePrompt,
  collectSiblingNoteNames,
  createModelFromConfig,
  extractAndSanitizeName,
} from './workspace/utils/ai-rename-utils'
import {
  type AiRenameUtils,
  createWorkspaceFsStore,
  type FrontmatterUtils,
  type ToastLike,
} from './workspace-fs-store-core'
import { workspaceStoreAdapter } from './workspace-store-adapter'
import {
  aiSettingsAdapter,
  collectionStoreAdapter,
  fileExplorerSelectionAdapter,
  tabStoreAdapter,
} from './workspace-store-adapters'

const frontmatterUtils: FrontmatterUtils = {
  updateFileFrontmatter,
  renameFileFrontmatterProperty,
  removeFileFrontmatterProperty,
}

const aiRenameUtils: AiRenameUtils = {
  AI_RENAME_SYSTEM_PROMPT,
  buildRenamePrompt,
  collectSiblingNoteNames,
  createModelFromConfig,
  extractAndSanitizeName,
}

const toastAdapter: ToastLike = toast

export const useWorkspaceFsStore = createWorkspaceFsStore({
  fileSystemRepository: new FileSystemRepository(),
  generateText,
  tabStoreAdapter,
  collectionStoreAdapter,
  fileExplorerSelectionAdapter,
  aiSettingsAdapter,
  workspaceStoreAdapter,
  frontmatterUtils,
  toast: toastAdapter,
  aiRenameUtils,
})
