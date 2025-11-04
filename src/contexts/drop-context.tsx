import { getCurrentWebview } from '@tauri-apps/api/webview'
import type React from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

type DropKind = 'over' | 'drop' | 'leave' | 'enter'
type Point = { x: number; y: number }

export type DropEvent = {
  type: DropKind
  position: Point
  paths?: string[]
}

export type DropZoneConfig = {
  ref: React.RefObject<HTMLDivElement | null>
  onEnter?: (e: DropEvent) => void
  onLeave?: () => void
  onDrop?: (paths: string[], e: DropEvent) => void
}

type ZoneInternal = DropZoneConfig & {
  id: string
  setIsOver: (v: boolean) => void
}

type DropAPI = {
  registerZone: (
    cfg: DropZoneConfig,
    setIsOver: (v: boolean) => void
  ) => () => void
}

const DropContext = createContext<DropAPI | null>(null)

function findZoneAtPoint(zones: Map<string, ZoneInternal>, pt: Point) {
  const el = document.elementFromPoint(pt.x, pt.y)
  const host = el?.closest<HTMLElement>('[data-drop-zone-id]')
  const id = host?.getAttribute('data-drop-zone-id')
  const zone = id ? zones.get(id) : undefined
  return zone
}

export const DropProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const zonesRef = useRef(new Map<string, ZoneInternal>())
  const currentZoneIdRef = useRef<string | null>(null)
  const unlistenRef = useRef<null | (() => void)>(null)

  const registerZone = useCallback<DropAPI['registerZone']>(
    (cfg, setIsOver) => {
      const id = crypto.randomUUID()
      const zone: ZoneInternal = { ...cfg, id, setIsOver }
      zonesRef.current.set(id, zone)

      if (!cfg.ref) {
        throw new Error('drop zone ref is not attached yet')
      }

      const el = cfg.ref.current
      if (el) el.setAttribute('data-drop-zone-id', id)

      return () => {
        const el = cfg.ref?.current
        if (el?.getAttribute('data-drop-zone-id') === id) {
          el?.removeAttribute('data-drop-zone-id')
        }
        zonesRef.current.delete(id)
      }
    },
    []
  )

  useEffect(() => {
    let stop = false
    ;(async () => {
      try {
        const webview = getCurrentWebview()
        const unlisten = await webview.onDragDropEvent((event) => {
          const kind = event.payload.type

          if (kind === 'leave') {
            const currentId = currentZoneIdRef.current
            if (currentId) {
              const zone = zonesRef.current.get(currentId)
              zone?.onLeave?.()
              zone?.setIsOver?.(false)
              currentZoneIdRef.current = null
            }
            return
          }

          if (kind !== 'over' && kind !== 'drop') return

          const position = event.payload.position
          let paths: string[] | undefined
          if (kind === 'drop') {
            paths = event.payload.paths
          }
          const e: DropEvent = {
            type: kind,
            position,
            paths: paths ?? undefined,
          }

          const zones = zonesRef.current
          const zoneAtPoint = findZoneAtPoint(zones, position)

          if (kind === 'over') {
            const prevId = currentZoneIdRef.current
            const nextId = zoneAtPoint?.id ?? null
            if (prevId !== nextId) {
              if (prevId) {
                const prev = zones.get(prevId)
                prev?.onLeave?.()
                prev?.setIsOver?.(false)
              }
              currentZoneIdRef.current = nextId
              if (zoneAtPoint) {
                zoneAtPoint.onEnter?.(e)
                zoneAtPoint.setIsOver?.(true)
              }
            }
            return
          }

          if (kind === 'drop') {
            const activeId = zoneAtPoint?.id ?? currentZoneIdRef.current
            if (activeId) {
              const z = zones.get(activeId)
              z?.onDrop?.(paths ?? [], e)
            }

            if (currentZoneIdRef.current) {
              const prev = zones.get(currentZoneIdRef.current)
              prev?.onLeave?.()
              prev?.setIsOver?.(false)
            }
            currentZoneIdRef.current = null
            return
          }
        })

        if (stop) {
          unlisten()
        } else {
          unlistenRef.current = unlisten
        }
      } catch (err) {
        console.error('failed to attach tauri drop listener', err)
      }
    })()

    return () => {
      stop = true
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
    }
  }, [])

  return (
    <DropContext.Provider value={{ registerZone }}>
      {children}
    </DropContext.Provider>
  )
}

export function useDropZone(config: DropZoneConfig) {
  const api = useContext(DropContext)
  const [isOver, setIsOver] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: true
  useEffect(() => {
    if (!api) return
    // Reason for return: registerZone provides an unregister function.
    return api.registerZone(config, setIsOver)
  }, [api])

  return { isOver }
}
