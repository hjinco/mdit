import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from 'react'
import { Confetti, type ConfettiRef } from '@/ui/confetti'

interface ConfettiContextType {
  fireConfetti: () => void
}

const ConfettiContext = createContext<ConfettiContextType | null>(null)

export function ConfettiProvider({ children }: { children: ReactNode }) {
  const confettiRef = useRef<ConfettiRef>(null)
  const animationFrameRef = useRef<number | null>(null)

  const fireConfetti = useCallback(() => {
    // Cancel any existing animation
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    const end = Date.now() + 1 * 1000
    const colors = ['#a786ff', '#fd8bbc', '#eca184', '#f8deb1']

    const frame = () => {
      if (Date.now() > end) {
        animationFrameRef.current = null
        return
      }

      confettiRef.current?.fire({
        particleCount: 2,
        angle: 60,
        spread: 55,
        startVelocity: 60,
        origin: { x: 0, y: 0.5 },
        colors,
      })

      confettiRef.current?.fire({
        particleCount: 2,
        angle: 120,
        spread: 55,
        startVelocity: 60,
        origin: { x: 1, y: 0.5 },
        colors,
      })

      animationFrameRef.current = requestAnimationFrame(frame)
    }

    frame()
  }, [])

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  const value: ConfettiContextType = {
    fireConfetti,
  }

  return (
    <ConfettiContext.Provider value={value}>
      <Confetti
        ref={confettiRef}
        className="pointer-events-none fixed inset-0 z-[9999] size-full"
        manualstart
      />
      {children}
    </ConfettiContext.Provider>
  )
}

export function useConfetti() {
  const context = useContext(ConfettiContext)
  if (!context) {
    return null
  }
  return context
}
