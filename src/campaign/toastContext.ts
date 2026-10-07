import { createContext, useContext } from 'react'

export type ToastVariant = 'success' | 'error'

export interface ToastApi {
  showToast(message: string, variant?: ToastVariant): void
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider> (CampaignLayout mounts it)')
  return api
}
