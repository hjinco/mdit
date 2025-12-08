import { invoke } from '@tauri-apps/api/core'
import { basename } from '@tauri-apps/api/path'
import { stat } from '@tauri-apps/plugin-fs'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/shallow'
import { useImageEditStore } from '@/store/image-edit-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/select'
import { Separator } from '@/ui/separator'
import { formatFileSize } from '@/utils/format-utils'
import {
  getBasePathAndExtension,
  replaceFileExtension,
} from '@/utils/path-utils'
import {
  executeSipsCommand,
  getImageProperties,
  type ImageFormat,
} from './utils/image-process-utils'

export function ImageEditDialog() {
  const { imageEditPath, closeImageEdit } = useImageEditStore(
    useShallow((state) => ({
      imageEditPath: state.imageEditPath,
      closeImageEdit: state.closeImageEdit,
    }))
  )
  const refreshWorkspaceEntries = useWorkspaceStore(
    (state) => state.refreshWorkspaceEntries
  )

  const [filename, setFilename] = useState('')
  const [resizeWidth, setResizeWidth] = useState<string>('')
  const [resizeHeight, setResizeHeight] = useState<string>('')
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true)
  const [format, setFormat] = useState<ImageFormat | 'keep'>('keep')
  const [quality, setQuality] = useState<string>('80')
  const [saveAsNewFile, setSaveAsNewFile] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [imageProperties, setImageProperties] = useState<{
    width: number
    height: number
    format: string
  } | null>(null)
  const [fileSize, setFileSize] = useState<number | null>(null)
  const lastChangedField = useRef<'width' | 'height' | null>(null)

  useEffect(() => {
    if (imageEditPath) {
      setIsLoading(true)
      basename(imageEditPath).then(setFilename).catch(console.error)
      // Reset form
      setResizeWidth('')
      setResizeHeight('')
      setMaintainAspectRatio(true)
      setFormat('keep')
      setQuality('80')
      setSaveAsNewFile(false)
      setImageProperties(null)
      setFileSize(null)

      // Fetch image properties and file size in parallel
      Promise.all([
        getImageProperties(imageEditPath)
          .then(setImageProperties)
          .catch((error) => {
            console.error('Failed to get image properties:', error)
            setImageProperties(null)
          }),
        stat(imageEditPath)
          .then((fileStat) => {
            setFileSize(fileStat.size ?? null)
          })
          .catch((error) => {
            console.error('Failed to get file size:', error)
            setFileSize(null)
          }),
      ]).finally(() => {
        setIsLoading(false)
      })
    } else {
      setIsLoading(false)
    }
  }, [imageEditPath])

  // Initialize resize inputs with current image dimensions
  useEffect(() => {
    if (imageProperties) {
      setResizeWidth(imageProperties.width.toString())
      setResizeHeight(imageProperties.height.toString())
      lastChangedField.current = null
    }
  }, [imageProperties])

  // Update height when width changes (if maintainAspectRatio is enabled)
  useEffect(() => {
    if (
      maintainAspectRatio &&
      imageProperties &&
      resizeWidth &&
      lastChangedField.current === 'width'
    ) {
      const width = Number.parseInt(resizeWidth, 10)
      if (!Number.isNaN(width) && width > 0) {
        const aspectRatio = imageProperties.width / imageProperties.height
        const newHeight = Math.round(width / aspectRatio)
        setResizeHeight(newHeight.toString())
        lastChangedField.current = null
      }
    }
  }, [resizeWidth, maintainAspectRatio, imageProperties])

  // Update width when height changes (if maintainAspectRatio is enabled)
  useEffect(() => {
    if (
      maintainAspectRatio &&
      imageProperties &&
      resizeHeight &&
      lastChangedField.current === 'height'
    ) {
      const height = Number.parseInt(resizeHeight, 10)
      if (!Number.isNaN(height) && height > 0) {
        const aspectRatio = imageProperties.width / imageProperties.height
        const newWidth = Math.round(height * aspectRatio)
        setResizeWidth(newWidth.toString())
        lastChangedField.current = null
      }
    }
  }, [resizeHeight, maintainAspectRatio, imageProperties])

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeImageEdit()
    }
  }

  const handleSubmit = async () => {
    if (!imageEditPath) return

    setIsProcessing(true)

    try {
      const options: Parameters<typeof executeSipsCommand>[1] = {}

      // Resize options
      if (resizeWidth || resizeHeight) {
        const width = resizeWidth ? Number.parseInt(resizeWidth, 10) : undefined
        const height = resizeHeight
          ? Number.parseInt(resizeHeight, 10)
          : undefined

        // Skip resize if values match original dimensions
        const shouldSkipResize =
          imageProperties &&
          ((width &&
            height &&
            width === imageProperties.width &&
            height === imageProperties.height) ||
            (width && !height && width === imageProperties.width) ||
            (!width && height && height === imageProperties.height))

        if (!shouldSkipResize) {
          if (width && width > 0) {
            options.resize = {
              width,
              height: height && height > 0 ? height : undefined,
              maintainAspectRatio,
            }
          } else if (height && height > 0) {
            options.resize = {
              height,
              maintainAspectRatio,
            }
          }
        }
      }

      // Format conversion
      if (format !== 'keep') {
        options.format = format
      }

      // Quality (for JPEG and WebP)
      if (quality) {
        const qualityNum = Number.parseInt(quality, 10)
        if (qualityNum >= 0 && qualityNum <= 100) {
          const shouldApplyQuality =
            format === 'jpeg' ||
            format === 'webp' ||
            (format === 'keep' &&
              (imageEditPath.toLowerCase().endsWith('.jpg') ||
                imageEditPath.toLowerCase().endsWith('.jpeg') ||
                imageEditPath.toLowerCase().endsWith('.webp')))
          if (shouldApplyQuality) {
            options.quality = qualityNum
          }
        }
      }

      // Detect format change
      const normalizedOriginalFormat =
        imageProperties?.format === 'jpg' ? 'jpeg' : imageProperties?.format
      const isFormatChanging =
        format !== 'keep' &&
        imageProperties &&
        normalizedOriginalFormat !== format

      // Output path
      if (saveAsNewFile) {
        const { basePath, extension: currentExtension } =
          getBasePathAndExtension(imageEditPath)
        const fallbackExtension =
          imageProperties?.format === 'jpg'
            ? 'jpeg'
            : (imageProperties?.format ?? null)
        const extension =
          format !== 'keep' ? format : (currentExtension ?? fallbackExtension)

        options.outputPath = extension
          ? `${basePath}_edited.${extension}`
          : `${basePath}_edited`
      } else if (isFormatChanging) {
        // Format is changing and not saving as new file
        // Generate new filename with new extension
        options.outputPath = replaceFileExtension(imageEditPath, format)
      }

      await executeSipsCommand(imageEditPath, options)

      // If format changed and not saving as new file, delete the original
      if (isFormatChanging && !saveAsNewFile) {
        try {
          await invoke('move_to_trash', { path: imageEditPath })
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : 'Failed to delete original file'
          toast.error(
            `Image converted but failed to delete original: ${errorMessage}`
          )
          console.error('Failed to delete original file:', error)
        }
      }

      toast.success('Image edited successfully')

      // Refresh workspace to show changes
      await refreshWorkspaceEntries()

      closeImageEdit()
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to edit image'
      toast.error(errorMessage)
      console.error('Failed to edit image:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const isJPEGOrWebPFormat =
    format === 'jpeg' ||
    format === 'webp' ||
    (format === 'keep' &&
      (imageEditPath?.toLowerCase().endsWith('.jpg') ||
        imageEditPath?.toLowerCase().endsWith('.jpeg') ||
        imageEditPath?.toLowerCase().endsWith('.webp')))

  const qualityLabel =
    format === 'webp' ||
    (format === 'keep' && imageEditPath?.toLowerCase().endsWith('.webp'))
      ? 'WebP Quality (0-100)'
      : 'JPEG Quality (0-100)'

  return (
    <Dialog
      open={!!imageEditPath && !isLoading}
      onOpenChange={handleOpenChange}
    >
      <DialogContent className="max-w-md" disableFadeAnimation>
        <DialogHeader>
          <DialogTitle>Edit Image</DialogTitle>
          <DialogDescription>
            {filename
              ? `Editing: ${filename}`
              : 'Configure image editing options'}
          </DialogDescription>
        </DialogHeader>

        {/* Current Image Properties */}
        {(imageProperties || fileSize !== null) && (
          <div className="rounded-lg border bg-muted/50 p-3 space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">
              Current Properties
            </Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {imageProperties && (
                <>
                  <span>
                    {imageProperties.width} × {imageProperties.height} px
                  </span>
                  <span className="capitalize">{imageProperties.format}</span>
                </>
              )}
              {fileSize !== null && <span>{formatFileSize(fileSize)}</span>}
            </div>
          </div>
        )}

        <div className="space-y-4 py-4">
          {/* Resize Section */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Resize</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Label
                  htmlFor="width"
                  className="text-xs text-muted-foreground"
                >
                  Width (px)
                </Label>
                <Input
                  id="width"
                  type="number"
                  min="1"
                  placeholder="Auto"
                  value={resizeWidth}
                  onChange={(e) => {
                    lastChangedField.current = 'width'
                    setResizeWidth(e.target.value)
                  }}
                  disabled={isProcessing}
                />
              </div>
              <div className="flex-1">
                <Label
                  htmlFor="height"
                  className="text-xs text-muted-foreground"
                >
                  Height (px)
                </Label>
                <Input
                  id="height"
                  type="number"
                  min="1"
                  placeholder="Auto"
                  value={resizeHeight}
                  onChange={(e) => {
                    lastChangedField.current = 'height'
                    setResizeHeight(e.target.value)
                  }}
                  disabled={isProcessing}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="maintain-ratio"
                checked={maintainAspectRatio}
                onCheckedChange={(checked) =>
                  setMaintainAspectRatio(checked === true)
                }
                disabled={isProcessing}
              />
              <Label
                htmlFor="maintain-ratio"
                className="text-sm cursor-pointer"
              >
                Maintain aspect ratio
              </Label>
            </div>
          </div>

          <Separator />

          {/* Format Section */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Format</Label>
            <Select
              value={format}
              onValueChange={(value) =>
                setFormat(value as ImageFormat | 'keep')
              }
              disabled={isProcessing}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">Keep original</SelectItem>
                <SelectItem value="jpeg">JPEG</SelectItem>
                <SelectItem value="png">PNG</SelectItem>
                <SelectItem value="webp">WebP</SelectItem>
                <SelectItem value="avif">AVIF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Quality Section (for JPEG and WebP) */}
          {isJPEGOrWebPFormat && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="text-base font-semibold">Quality</Label>
                <div>
                  <Label
                    htmlFor="quality"
                    className="text-xs text-muted-foreground"
                  >
                    {qualityLabel}
                  </Label>
                  <Input
                    id="quality"
                    type="number"
                    min="0"
                    max="100"
                    value={quality}
                    onChange={(e) => setQuality(e.target.value)}
                    disabled={isProcessing}
                  />
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Save Options */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Save Options</Label>
            <div className="flex items-center gap-2">
              <Checkbox
                id="save-as-new"
                checked={saveAsNewFile}
                onCheckedChange={(checked) =>
                  setSaveAsNewFile(checked === true)
                }
                disabled={isProcessing}
              />
              <Label htmlFor="save-as-new" className="text-sm cursor-pointer">
                Save as new file (keeps original)
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={closeImageEdit}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isProcessing}>
            {isProcessing ? 'Processing...' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
