import { convertFileSrc } from '@tauri-apps/api/core'
import { basename } from '@tauri-apps/api/path'
import { ImageOff } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { useUIStore } from '@/store/ui-store'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/dialog'

export function ImagePreviewDialog() {
  const { imagePreviewPath, closeImagePreview } = useUIStore(
    useShallow((state) => ({
      imagePreviewPath: state.imagePreviewPath,
      closeImagePreview: state.closeImagePreview,
    }))
  )

  const [hasError, setHasError] = useState(false)
  const [isImageReady, setIsImageReady] = useState(false)
  const [displayPath, setDisplayPath] = useState<string | null>(null)
  const [displayFilename, setDisplayFilename] = useState('')
  const timeoutRef = useRef<number | null>(null)

  const src = useMemo(() => {
    if (!displayPath) return ''
    if (displayPath.startsWith('http')) {
      return displayPath
    }
    return convertFileSrc(displayPath)
  }, [displayPath])

  useEffect(() => {
    if (imagePreviewPath) {
      setDisplayPath(imagePreviewPath)
      setHasError(false)
      setIsImageReady(false)
      basename(imagePreviewPath).then(setDisplayFilename).catch(console.error)
    } else {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = window.setTimeout(() => {
        setDisplayPath(null)
        setDisplayFilename('')
        setIsImageReady(false)
        setHasError(false)
        timeoutRef.current = null
      }, 200)
    }

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [imagePreviewPath])

  useEffect(() => {
    if (displayPath) {
      setHasError(false)
      setIsImageReady(false)
    }
  }, [displayPath])

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeImagePreview()
    }
  }

  return (
    <>
      {src && !isImageReady && !hasError && (
        // biome-ignore lint/nursery/useImageSize: true
        <img
          src={src}
          alt=""
          className="hidden"
          onLoad={() => setIsImageReady(true)}
          onError={() => {
            setHasError(true)
            setIsImageReady(true)
          }}
        />
      )}
      <Dialog
        open={!!imagePreviewPath && (isImageReady || hasError)}
        onOpenChange={handleOpenChange}
      >
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle>{displayFilename || 'Image Preview'}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center px-6 pb-6 max-h-[calc(90vh-8rem)] overflow-auto">
            {hasError ? (
              <div className="flex flex-col items-center justify-center min-h-[300px] py-8">
                <ImageOff className="w-16 h-16 text-muted-foreground/50 mb-4" />
                <p className="text-sm text-muted-foreground text-center">
                  Failed to load image. Please check the file path.
                </p>
              </div>
            ) : (
              src && (
                // biome-ignore lint/nursery/useImageSize: dynamic image preview
                <img
                  src={src}
                  alt={displayFilename}
                  className="max-w-full max-h-full object-contain rounded-sm"
                />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
