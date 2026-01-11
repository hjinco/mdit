import { invoke } from '@tauri-apps/api/core'
import { basename } from '@tauri-apps/api/path'
import { stat } from '@tauri-apps/plugin-fs'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/shallow'
import { useImageEditStore } from '@/store/image-edit-store'
import { useWorkspaceFsStore } from '@/store/workspace-fs-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog'
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
  editImage,
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
  const { refreshWorkspaceEntries } = useWorkspaceStore(
    useShallow((state) => ({
      refreshWorkspaceEntries: state.refreshWorkspaceEntries,
    }))
  )
  const recordFsOperation = useWorkspaceFsStore(
    (state) => state.recordFsOperation
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
      const options: Parameters<typeof editImage>[1] = {}

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

      await editImage(imageEditPath, options)
      recordFsOperation()

      // If format changed and not saving as new file, delete the original
      if (isFormatChanging && !saveAsNewFile) {
        try {
          await invoke('move_to_trash', { path: imageEditPath })
          recordFsOperation()
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

  return (
    <Dialog
      open={!!imageEditPath && !isLoading}
      onOpenChange={handleOpenChange}
    >
      <DialogContent className="max-w-md p-0 gap-0" disableFadeAnimation>
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-sm font-medium">Edit Image</DialogTitle>
        </DialogHeader>

        <div className="p-2 grid gap-1">
          {/* File Name */}
          <div className="grid grid-cols-[100px_1fr] items-center px-2 py-1.5 h-8">
            <Label className="text-xs font-normal text-muted-foreground">
              Name
            </Label>
            <div className="text-xs truncate" title={filename}>
              {filename || '-'}
            </div>
          </div>

          {/* Dimensions */}
          <div className="grid grid-cols-[100px_1fr] items-center px-2 py-1.5 h-8">
            <Label className="text-xs font-normal text-muted-foreground">
              Dimensions
            </Label>
            <div className="text-xs">
              {imageProperties
                ? `${imageProperties.width} × ${imageProperties.height}`
                : '-'}
            </div>
          </div>

          {/* Size & Format (Informational) */}
          <div className="grid grid-cols-[100px_1fr] items-center px-2 py-1.5 h-8">
            <Label className="text-xs font-normal text-muted-foreground">
              Size
            </Label>
            <div className="text-xs">
              {fileSize !== null ? formatFileSize(fileSize) : '-'}
            </div>
          </div>

          <Separator className="my-1" />

          {/* Resize */}
          <div className="grid grid-cols-[100px_1fr] items-center px-2 py-1.5">
            <Label className="text-xs font-normal text-muted-foreground">
              Resize
            </Label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-muted/30 rounded border px-2 h-7 focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-all w-24">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  W
                </span>
                <input
                  type="number"
                  min="1"
                  placeholder="Auto"
                  className="flex-1 bg-transparent text-xs border-none p-0 h-full focus:outline-none focus:ring-0 placeholder:text-muted-foreground/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={resizeWidth}
                  onChange={(e) => {
                    lastChangedField.current = 'width'
                    setResizeWidth(e.target.value)
                  }}
                  disabled={isProcessing}
                />
              </div>
              <div className="flex items-center gap-1.5 bg-muted/30 rounded border px-2 h-7 focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-all w-24">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  H
                </span>
                <input
                  type="number"
                  min="1"
                  placeholder="Auto"
                  className="flex-1 bg-transparent text-xs border-none p-0 h-full focus:outline-none focus:ring-0 placeholder:text-muted-foreground/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={resizeHeight}
                  onChange={(e) => {
                    lastChangedField.current = 'height'
                    setResizeHeight(e.target.value)
                  }}
                  disabled={isProcessing}
                />
              </div>
            </div>
          </div>

          {/* Aspect Ratio */}
          <div className="grid grid-cols-[100px_1fr] items-center px-2 py-1.5 h-8">
            <Label className="text-xs font-normal text-muted-foreground">
              Aspect Ratio
            </Label>
            <div className="flex items-center gap-2">
              <Checkbox
                id="maintain-ratio"
                checked={maintainAspectRatio}
                onCheckedChange={(checked) =>
                  setMaintainAspectRatio(checked === true)
                }
                disabled={isProcessing}
                className="h-4 w-4"
              />
              <Label
                htmlFor="maintain-ratio"
                className="text-xs font-normal cursor-pointer text-foreground"
              >
                Locked
              </Label>
            </div>
          </div>

          <Separator className="my-1" />

          {/* Format */}
          <div className="grid grid-cols-[100px_1fr] items-center px-2 py-1.5">
            <Label className="text-xs font-normal text-muted-foreground">
              Format
            </Label>
            <Select
              value={format}
              onValueChange={(value) =>
                setFormat(value as ImageFormat | 'keep')
              }
              disabled={isProcessing}
            >
              <SelectTrigger className="w-full py-0 h-7! text-xs rounded">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded">
                <SelectItem value="keep" className="text-xs rounded-sm">
                  Keep original
                </SelectItem>
                <SelectItem value="jpeg" className="text-xs rounded-sm">
                  JPEG
                </SelectItem>
                <SelectItem value="png" className="text-xs rounded-sm">
                  PNG
                </SelectItem>
                <SelectItem value="webp" className="text-xs rounded-sm">
                  WebP
                </SelectItem>
                <SelectItem value="avif" className="text-xs rounded-sm">
                  AVIF
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Quality */}
          {isJPEGOrWebPFormat && (
            <div className="grid grid-cols-[100px_1fr] items-center px-2 py-1.5">
              <Label className="text-xs font-normal text-muted-foreground">
                Quality
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-muted/30 rounded border px-2 h-7 focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-all w-24">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    Q
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={quality}
                    onChange={(e) => setQuality(e.target.value)}
                    disabled={isProcessing}
                    className="flex-1 bg-transparent text-xs border-none p-0 h-full focus:outline-none focus:ring-0 placeholder:text-muted-foreground/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>
          )}

          {/* Save As New */}
          <div className="grid grid-cols-[100px_1fr] items-center px-2 py-1.5 h-8">
            <Label className="text-xs font-normal text-muted-foreground">
              Save Copy
            </Label>
            <div className="flex items-center gap-2">
              <Checkbox
                id="save-as-new"
                checked={saveAsNewFile}
                onCheckedChange={(checked) =>
                  setSaveAsNewFile(checked === true)
                }
                disabled={isProcessing}
                className="h-4 w-4"
              />
              <Label
                htmlFor="save-as-new"
                className="text-xs font-normal cursor-pointer text-foreground"
              >
                Create new file
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter className="p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={closeImageEdit}
            disabled={isProcessing}
            className="h-8 text-xs hover:bg-muted/50"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isProcessing}
            size="sm"
            className="h-8 text-xs px-4"
          >
            {isProcessing ? 'Processing' : 'Done'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
