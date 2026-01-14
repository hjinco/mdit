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
import { useStore } from '@/store'

type DropKind = 'over' | 'drop' | 'leave' | 'enter'
type Point = { x: number; y: number }

export type DropEvent = {
  type: DropKind
  position: Point
  paths?: string[]
}

export type DropZoneConfig = {
  ref: React.RefObject<HTMLDivElement | null>
  path: string | null
  depth?: number
  onEnter?: (e: DropEvent) => void
  onLeave?: () => void
  onDrop?: (paths: string[], e: DropEvent) => void
}

type ZoneInternal = DropZoneConfig & {
  setIsOver: (v: boolean) => void
  depth: number
}

type DropAPI = {
  registerZone: (
    cfg: DropZoneConfig,
    setIsOver: (v: boolean) => void
  ) => () => void
}

const DropContext = createContext<DropAPI | null>(null)

function findZoneAtPoint(zones: Map<string, ZoneInternal>, pt: Point) {
  // Get all elements at the point (not just the top one)
  const elements = document.elementsFromPoint(pt.x, pt.y)

  // Find all zones that contain these elements
  const foundZones = elements
    .map((el) => {
      const host = el.closest<HTMLElement>('[data-drop-zone-id]')
      const id = host?.getAttribute('data-drop-zone-id')
      return id ? zones.get(id) : undefined
    })
    .filter((zone): zone is ZoneInternal => zone !== undefined)

  if (foundZones.length === 0) {
    return
  }

  // Return the zone with the deepest depth (highest depth value)
  return foundZones.sort((a, b) => (b.depth ?? -1) - (a.depth ?? -1))[0]
}

export const DropProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const zonesRef = useRef(new Map<string, ZoneInternal>())
  const currentZoneIdRef = useRef<string | null>(null)
  const unlistenRef = useRef<null | (() => void)>(null)
  const workspacePath = useStore((state) => state.workspacePath)

  const registerZone = useCallback<DropAPI['registerZone']>(
    (cfg, setIsOver) => {
      const path = cfg.path
      if (!path) return () => {}

      const zone: ZoneInternal = {
        ...cfg,
        setIsOver,
        depth: cfg.depth ?? -1,
      }
      zonesRef.current.set(path, zone)

      if (!cfg.ref) {
        throw new Error('drop zone ref is not attached yet')
      }

      const el = cfg.ref.current
      if (el) el.setAttribute('data-drop-zone-id', path)

      return () => {
        const el = cfg.ref?.current
        if (el?.getAttribute('data-drop-zone-id') === path) {
          el?.removeAttribute('data-drop-zone-id')
        }
        zonesRef.current.delete(path)
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
            const nextId = zoneAtPoint?.path ?? null
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
            const activeId = zoneAtPoint?.path ?? currentZoneIdRef.current
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

  useEffect(() => {
    for (const [path, zone] of zonesRef.current.entries()) {
      if (zone.path !== workspacePath) {
        zonesRef.current.delete(path)
      }
    }
    currentZoneIdRef.current = null
  }, [workspacePath])

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
