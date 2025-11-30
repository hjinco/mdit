import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

// Focus mode hides chrome (e.g., editor header) once the user is clearly typing
// without mouse movement. It avoids flicker by requiring a burst of keystrokes
// after the mouse has been idle and resets the burst when typing pauses.
const FOCUS_TYPING_THRESHOLD = 8
const FOCUS_MOUSE_IDLE_MS = 2000
const FOCUS_TYPING_RESET_MS = 1200

type FocusModeContextValue = {
  isFocusMode: boolean
  handleTypingProgress: () => void
}

const FocusModeContext = createContext<FocusModeContextValue | null>(null)

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [isFocusMode, setIsFocusMode] = useState(false)
  const lastMouseMoveRef = useRef(Date.now())
  const typingBurstCountRef = useRef(0)
  const typingBurstResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Any mouse movement immediately exits focus mode and clears typing state,
    // so the UI can reappear as soon as the cursor is moved.
    const handleMouseMove = () => {
      lastMouseMoveRef.current = Date.now()
      typingBurstCountRef.current = 0

      if (typingBurstResetRef.current) {
        clearTimeout(typingBurstResetRef.current)
        typingBurstResetRef.current = null
      }

      if (isFocusMode) {
        setIsFocusMode(false)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [isFocusMode])

  const handleTypingProgress = useCallback(() => {
    // Ignore typing bursts while the mouse is still considered "active".
    const now = Date.now()

    if (now - lastMouseMoveRef.current < FOCUS_MOUSE_IDLE_MS) return

    // Count consecutive keystrokes (reset with a timeout) to detect real typing.
    typingBurstCountRef.current += 1

    if (typingBurstResetRef.current) {
      clearTimeout(typingBurstResetRef.current)
    }

    typingBurstResetRef.current = setTimeout(() => {
      typingBurstCountRef.current = 0
      typingBurstResetRef.current = null
    }, FOCUS_TYPING_RESET_MS)

    if (!isFocusMode && typingBurstCountRef.current >= FOCUS_TYPING_THRESHOLD) {
      typingBurstCountRef.current = 0
      setIsFocusMode(true)
    }
  }, [isFocusMode])

  const value = useMemo(
    () => ({
      isFocusMode,
      handleTypingProgress,
    }),
    [isFocusMode, handleTypingProgress]
  )

  return (
    <FocusModeContext.Provider value={value}>
      {children}
    </FocusModeContext.Provider>
  )
}

export function useFocusMode() {
  const ctx = useContext(FocusModeContext)
  if (!ctx) {
    throw new Error('useFocusMode must be used within a FocusModeProvider')
  }
  return ctx
}
