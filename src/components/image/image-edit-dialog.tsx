import { basename } from '@tauri-apps/api/path'
import { useEffect, useState } from 'react'
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
import { executeSipsCommand, type ImageFormat } from './image-utils'

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

  useEffect(() => {
    if (imageEditPath) {
      basename(imageEditPath).then(setFilename).catch(console.error)
      // Reset form
      setResizeWidth('')
      setResizeHeight('')
      setMaintainAspectRatio(true)
      setFormat('keep')
      setQuality('80')
      setSaveAsNewFile(false)
    }
  }, [imageEditPath])

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

      // Format conversion
      if (format !== 'keep') {
        options.format = format
      }

      // Quality (only for JPEG)
      if (
        (format === 'jpeg' ||
          (format === 'keep' &&
            imageEditPath.toLowerCase().endsWith('.jpg'))) &&
        quality
      ) {
        const qualityNum = Number.parseInt(quality, 10)
        if (qualityNum >= 0 && qualityNum <= 100) {
          options.quality = qualityNum
        }
      }

      // Output path
      if (saveAsNewFile) {
        // Generate new filename
        const pathParts = imageEditPath.split('.')
        const extension = format !== 'keep' ? format : (pathParts.at(-1) ?? '')
        const basePath = pathParts.slice(0, -1).join('.')
        options.outputPath = `${basePath}_edited.${extension}`
      }

      await executeSipsCommand(imageEditPath, options)

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

  const isJPEGFormat =
    format === 'jpeg' ||
    (format === 'keep' && imageEditPath?.toLowerCase().endsWith('.jpg'))

  return (
    <Dialog open={!!imageEditPath} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Image</DialogTitle>
          <DialogDescription>
            {filename
              ? `Editing: ${filename}`
              : 'Configure image editing options'}
          </DialogDescription>
        </DialogHeader>

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
                  onChange={(e) => setResizeWidth(e.target.value)}
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
                  onChange={(e) => setResizeHeight(e.target.value)}
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
                <SelectItem value="heic">HEIC</SelectItem>
                <SelectItem value="tiff">TIFF</SelectItem>
                <SelectItem value="webp">WebP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Quality Section (only for JPEG) */}
          {isJPEGFormat && (
            <>
              <Separator />
              <div className="space-y-3">
                <Label className="text-base font-semibold">Quality</Label>
                <div>
                  <Label
                    htmlFor="quality"
                    className="text-xs text-muted-foreground"
                  >
                    JPEG Quality (0-100)
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
