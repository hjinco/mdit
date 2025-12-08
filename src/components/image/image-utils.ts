import { Command } from '@tauri-apps/plugin-shell'

export type ImageFormat = 'jpeg' | 'png' | 'heic' | 'tiff' | 'webp'

export type ImageEditOptions = {
  resize?: {
    width?: number
    height?: number
    maintainAspectRatio?: boolean
  }
  format?: ImageFormat
  quality?: number // 0-100, only for JPEG
  outputPath?: string // If not provided, overwrites original
}

/**
 * Executes sips command to edit an image
 * @param inputPath Path to the input image file
 * @param options Image editing options
 * @returns Promise that resolves to the output path
 */
export async function executeSipsCommand(
  inputPath: string,
  options: ImageEditOptions
): Promise<string> {
  const outputPath = options.outputPath || inputPath
  const args: string[] = []

  // Add resize options
  if (options.resize) {
    const { width, height, maintainAspectRatio } = options.resize
    if (width && height && !maintainAspectRatio) {
      // Specific width and height
      args.push('--resampleHeightWidth', height.toString(), width.toString())
    } else if (width || height) {
      // Resize maintaining aspect ratio
      const size = width || height || 0
      args.push('-Z', size.toString())
    }
  }

  // Add format conversion and quality
  if (options.format) {
    args.push('-s', 'format', options.format)
    // Quality must be set after format for JPEG
    if (options.format === 'jpeg' && options.quality !== undefined) {
      args.push('-s', 'formatOptions', options.quality.toString())
    }
  } else if (options.quality !== undefined) {
    // If no format conversion but quality is specified, assume JPEG
    args.push('-s', 'format', 'jpeg')
    args.push('-s', 'formatOptions', options.quality.toString())
  }

  // Add output path
  args.push('--out', outputPath)

  // Add input path (must be last)
  args.push(inputPath)

  try {
    const command = Command.create('sips', args)
    const result = await command.execute()

    if (result.code !== 0) {
      const errorMessage = result.stderr || 'Unknown error occurred'
      throw new Error(`sips command failed: ${errorMessage}`)
    }

    return outputPath
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error(`Failed to execute sips command: ${String(error)}`)
  }
}
