import { invoke } from '@tauri-apps/api/core'

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif'

export type ImageProperties = {
  width: number
  height: number
  format: string
}

export type ImageEditOptions = {
  resize?: {
    width?: number
    height?: number
    maintainAspectRatio?: boolean
  }
  format?: ImageFormat
  quality?: number // 0-100, for JPEG and WebP
  outputPath?: string // If not provided, overwrites original
}

/**
 * Gets image properties (dimensions and format) using Tauri invoke
 * @param imagePath Path to the image file
 * @returns Promise that resolves to image properties
 */
export async function getImageProperties(
  imagePath: string
): Promise<ImageProperties> {
  try {
    const properties = await invoke<ImageProperties>('get_image_properties', {
      path: imagePath,
    })
    return properties
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error(`Failed to get image properties: ${String(error)}`)
  }
}

/**
 * Edits an image using Tauri invoke
 * @param inputPath Path to the input image file
 * @param options Image editing options
 * @returns Promise that resolves to the output path
 */
export async function editImage(
  inputPath: string,
  options: ImageEditOptions
): Promise<string> {
  try {
    const outputPath = await invoke<string>('edit_image', {
      inputPath,
      options,
    })
    return outputPath
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error(`Failed to edit image: ${String(error)}`)
  }
}
