import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Toast from '../components/Toast'
import { ToastContext, type ToastVariant } from './toastContext'

/** Same timings as the legacy `showToast`: errors stay longer. */
const DURATION_MS: Record<ToastVariant, number> = { success: 2500, error: 5000 }

/** One toast at a time for the whole campaign layout (the legacy Toast component, hub-owned state). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const showToast = useCallback((message: string, variant: ToastVariant = 'success') => {
    if (timer.current) clearTimeout(timer.current)
    setToast({ message, variant })
    timer.current = setTimeout(() => setToast(null), DURATION_MS[variant])
  }, [])
  const api = useMemo(() => ({ showToast }), [showToast])
  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && <Toast message={toast.message} variant={toast.variant} />}
    </ToastContext.Provider>
  )
}

