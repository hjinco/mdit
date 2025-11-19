import { memo, useCallback, useState } from 'react'
import { Kbd, KbdGroup } from '@/ui/kbd'
import { Popover, PopoverAnchor, PopoverContent } from '@/ui/popover'
import { tooltipContentVariants } from '@/ui/tooltip'

type CollectionResizerProps = {
  isOpen: boolean
  isResizing: boolean
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
}

export const CollectionResizer = memo(function CollectionResizer({
  isOpen,
  isResizing,
  onPointerDown,
}: CollectionResizerProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const [anchorPoint, setAnchorPoint] = useState<{
    x: number
    y: number
  } | null>(null)

  const updateAnchorPoint = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const { clientX, clientY } = event
      setAnchorPoint({ x: clientX, y: clientY })
    },
    []
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      setIsPopoverOpen(false)
      onPointerDown(event)
    },
    [onPointerDown]
  )

  const handlePointerEnter = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      updateAnchorPoint(event)
      setIsPopoverOpen(true)
    },
    [updateAnchorPoint]
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isPopoverOpen) return
      updateAnchorPoint(event)
    },
    [isPopoverOpen, updateAnchorPoint]
  )

  const handlePointerLeave = useCallback(() => {
    setIsPopoverOpen(false)
  }, [])

  if (!isOpen) {
    return null
  }

  return (
    <Popover
      modal={false}
      open={isPopoverOpen && Boolean(anchorPoint)}
      onOpenChange={(open) => {
        setIsPopoverOpen(open)
      }}
    >
      {anchorPoint && (
        <PopoverAnchor asChild>
          <span
            aria-hidden
            style={{
              position: 'fixed',
              top: anchorPoint.y,
              left: anchorPoint.x,
              width: 0,
              height: 0,
              pointerEvents: 'none',
            }}
          />
        </PopoverAnchor>
      )}
      <div
        className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize bg-transparent"
        onPointerDown={handlePointerDown}
        onPointerEnter={handlePointerEnter}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      />
      {!isResizing && (
        <PopoverContent
          align="center"
          side="right"
          sideOffset={4}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className={tooltipContentVariants}
        >
          <div className="flex items-center gap-1">
            Toggle
            <KbdGroup>
              <Kbd className="bg-background/20 text-background dark:bg-background/10">
                Cmd
              </Kbd>
              <Kbd className="bg-background/20 text-background dark:bg-background/10">
                Shift
              </Kbd>
              <Kbd className="bg-background/20 text-background dark:bg-background/10">
                S
              </Kbd>
            </KbdGroup>
          </div>
        </PopoverContent>
      )}
    </Popover>
  )
})
